#!/usr/bin/env node
/**
 * ExpenseOne — 비인증 경량 smoke 테스트 (옵션 A)
 *
 * 설치된 `playwright` 코어 라이브러리만 사용 (@playwright/test 러너 불필요).
 * 인증 없이 잡을 수 있는 회귀(로그인 페이지 렌더, JS 콘솔/예외, 정적 자산,
 * 환율 API)를 검사한다. 주간 헬스체크 routine과 로컬 양쪽에서 실행 가능.
 *
 *   node scripts/smoke.mjs                 # 기본: 프로덕션
 *   SMOKE_BASE_URL=http://localhost:5001 node scripts/smoke.mjs
 *
 * 실패가 하나라도 있으면 exit code 1 (routine/CI가 회귀를 감지하도록).
 */
import { chromium, request as pwRequest } from "playwright";

const BASE = (process.env.SMOKE_BASE_URL || "https://expenseone.vercel.app").replace(/\/+$/, "");
const ORIGIN = new URL(BASE).origin;
const TIMEOUT = Number(process.env.SMOKE_TIMEOUT_MS || 30000);

// 무시할 콘솔 에러(서드파티/로그아웃 상태에서 정상인 노이즈). 처음엔 좁게 유지.
const IGNORE_CONSOLE = [/favicon/i];

const failures = [];
let checks = 0;
const fail = (m) => { failures.push(m); checks++; console.error("  ✗ " + m); };
const pass = (m) => { checks++; console.log("  ✓ " + m); };

async function run() {
  console.log(`\n🔎 ExpenseOne smoke test → ${BASE}\n`);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    const badResponses = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => pageErrors.push(String(e?.message || e)));
    page.on("response", (r) => {
      const u = r.url();
      if (u.startsWith(ORIGIN) && r.status() >= 400) badResponses.push(`${r.status()} ${u}`);
    });
    page.on("requestfailed", (r) => {
      const u = r.url();
      if (u.startsWith(ORIGIN)) badResponses.push(`requestfailed ${u} (${r.failure()?.errorText || "?"})`);
    });

    // [1] 로그인 페이지 로드 + 렌더 + 콘솔/예외
    console.log("[1] 로그인 페이지");
    const resp = await page.goto(`${BASE}/login`, { waitUntil: "load", timeout: TIMEOUT }).catch((e) => {
      fail(`/login 이동 실패: ${e.message}`);
      return null;
    });
    if (resp) {
      if (resp.status() === 200) pass("/login HTTP 200");
      else fail(`/login HTTP ${resp.status()}`);

      let rendered = false;
      try {
        await page.getByRole("button", { name: /Google 계정으로 로그인/ }).first()
          .waitFor({ state: "visible", timeout: 10000 });
        rendered = true;
      } catch {}
      if (rendered) pass('로그인 UI 렌더됨 ("Google 계정으로 로그인" 버튼)');
      else fail('로그인 UI 미표시 ("Google 계정으로 로그인" 버튼 없음 — 렌더 실패 가능)');

      await page.waitForTimeout(1500); // 늦게 뜨는 에러 수집
    }

    // [2] JS 예외 / 콘솔 에러 0
    console.log("[2] JS 예외 / 콘솔 에러");
    if (pageErrors.length === 0) pass("uncaught JS 예외 0");
    else pageErrors.forEach((e) => fail(`uncaught JS 예외: ${e}`));

    const realErrors = consoleErrors.filter((t) => !IGNORE_CONSOLE.some((rx) => rx.test(t)));
    if (realErrors.length === 0) {
      pass(`console 에러 0${consoleErrors.length ? ` (무시 ${consoleErrors.length}건 제외)` : ""}`);
    } else {
      realErrors.forEach((t) => fail(`console.error: ${t}`));
    }

    // [3] 동일 출처 정적 자산/요청 — 4xx/5xx 0
    console.log("[3] 정적 자산 / 동일 출처 요청");
    const uniqueBad = [...new Set(badResponses)];
    if (uniqueBad.length === 0) pass("동일 출처 자원 4xx/5xx 0");
    else uniqueBad.forEach((b) => fail(`동일 출처 4xx/5xx: ${b}`));

    // [4] 비인증 접근 → /login 리다이렉트 (미들웨어 회귀)
    console.log("[4] 비인증 리다이렉트");
    const page2 = await context.newPage();
    await page2.goto(`${BASE}/`, { waitUntil: "load", timeout: TIMEOUT }).catch(() => {});
    const finalUrl = page2.url();
    if (/\/login/.test(finalUrl)) pass(`/ → ${finalUrl} (로그인 리다이렉트)`);
    else fail(`/ 비인증 접근이 /login으로 리다이렉트 안 됨 (현재: ${finalUrl})`);

    await context.close();
  } finally {
    await browser.close();
  }

  // [5] 환율 — 앱 엔드포인트는 인증 필수이므로 비인증으로는 (a) 보호 동작과
  //     (b) 실제 환율 소스(Frankfurter fallback) 상태를 검사한다. (b)가 503-class
  //     백엔드 회귀(환율 조회 불가)를 잡는 핵심 신호.
  console.log("[5] 환율 (엔드포인트 보호 + 소스 상태)");
  const api = await pwRequest.newContext();
  try {
    // (a) /api/exchange-rate 는 인증 필수 → 미인증 요청은 /login 으로 리다이렉트되어야 함
    const prot = await api.get(`${BASE}/api/exchange-rate?currency=USD`, { timeout: TIMEOUT, maxRedirects: 0 });
    const loc = prot.headers()["location"] || "";
    if ((prot.status() === 307 || prot.status() === 302) && /\/login/.test(loc)) {
      pass(`/api/exchange-rate 인증 보호 정상 (${prot.status()} → /login)`);
    } else {
      fail(`/api/exchange-rate 미인증 보호 이상: HTTP ${prot.status()} (location: ${loc || "없음"})`);
    }

    // (b) 환율 소스(Frankfurter fallback) 헬스 — USD→KRW rate 유효해야 함
    const fr = await api.get("https://api.frankfurter.dev/v1/latest?from=USD&to=KRW", { timeout: TIMEOUT });
    if (fr.status() !== 200) {
      fail(`환율 소스(Frankfurter) HTTP ${fr.status()}`);
    } else {
      const j = await fr.json().catch(() => null);
      const krw = j?.rates?.KRW;
      if (typeof krw !== "number" || !Number.isFinite(krw) || krw <= 0) {
        fail(`환율 소스 응답에 유효한 KRW rate 없음: ${JSON.stringify(j)}`);
      } else {
        pass(`환율 소스(Frankfurter) 200, USD→KRW=${krw}`);
      }
    }
  } catch (e) {
    fail(`환율 검사 요청 실패: ${e.message}`);
  } finally {
    await api.dispose();
  }

  // [6] Cron 엔드포인트 — 미인증 401(fail-secure)이어야 하고, 5xx 회귀를 감지
  console.log("[6] Cron 엔드포인트 (fail-secure)");
  const cronApi = await pwRequest.newContext();
  try {
    for (const path of ["/api/cron/gowid-sync", "/api/cron/due-date-check"]) {
      const r = await cronApi.get(`${BASE}${path}`, { timeout: TIMEOUT, maxRedirects: 0 });
      if (r.status() >= 500) fail(`${path} HTTP ${r.status()} (5xx 회귀)`);
      else if (r.status() === 401) pass(`${path} 401 (fail-secure 정상)`);
      else pass(`${path} HTTP ${r.status()} (5xx 아님)`);
    }
  } catch (e) {
    fail(`cron 검사 요청 실패: ${e.message}`);
  } finally {
    await cronApi.dispose();
  }

  // 결과
  console.log("\n" + "=".repeat(52));
  if (failures.length === 0) {
    console.log(`✅ SMOKE PASS — ${checks}개 검사 모두 통과 (${BASE})`);
    process.exit(0);
  } else {
    console.error(`❌ SMOKE FAIL — ${failures.length}/${checks} 실패 (${BASE})`);
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("smoke 실행 중 예기치 못한 오류:", e);
  process.exit(1);
});
