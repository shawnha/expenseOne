import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";

const BASE = "http://localhost:3000";
const SLOW = 350;
const DIR = "./e2e-screenshots";
mkdirSync(DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let step = 0;

async function shot(page, name) {
  step++;
  const f = `${DIR}/${String(step).padStart(2, "0")}_${name}.png`;
  await page.screenshot({ path: f, fullPage: true });
  console.log(`📸 ${f}`);
}

const issues = [];
function issue(sev, area, desc) {
  issues.push({ severity: sev, area, description: desc, step });
  const ic = sev === "CRITICAL" ? "🔴" : sev === "HIGH" ? "🟠" : "🟡";
  console.log(`${ic} [${sev}] ${desc}`);
}

async function vis(loc) { try { return await loc.isVisible(); } catch { return false; } }

async function go(page, path) {
  await page.goto(BASE + path, { waitUntil: "commit", timeout: 15000 });
  await sleep(3000);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: SLOW });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  const networkErrors = [];
  page.on("response", (r) => { if (r.status() >= 400) networkErrors.push({ url: r.url(), status: r.status() }); });

  // 1. HOME
  console.log("\n=== 1. 홈 대시보드 ===");
  await go(page, "/");
  await shot(page, "home");
  if (page.url().includes("/login")) issue("CRITICAL", "인증", "BYPASS_AUTH=true인데 로그인 리다이렉트");
  else console.log(`✅ 홈 OK (${page.url()})`);

  // 2. EXPENSE LIST
  console.log("\n=== 2. 비용 목록 ===");
  await go(page, "/expenses");
  await shot(page, "expense_list");

  const listText = await page.textContent("body");
  if (listText.includes("__all__")) issue("HIGH", "비용 목록 필터", "'__all__' 텍스트 노출");
  else console.log("✅ __all__ 미노출");

  const dates = page.locator('input[type="date"]');
  if ((await dates.count()) >= 2) {
    const s = await dates.nth(0).inputValue();
    const e = await dates.nth(1).inputValue();
    if (!s || !e) issue("MEDIUM", "비용 목록 필터", "날짜 기본값 미설정");
    else console.log(`✅ 날짜: ${s} ~ ${e}`);
  }

  const sels = page.locator("select");
  for (let i = 0; i < await sels.count(); i++) {
    const txt = await sels.nth(i).evaluate((el) => el.options[el.selectedIndex]?.text || "");
    const val = await sels.nth(i).inputValue();
    console.log(`  Select #${i + 1}: "${txt}" (${val})`);
  }
  await shot(page, "filters");

  // 3. DEPOSIT FORM
  console.log("\n=== 3. 입금요청 폼 ===");
  await go(page, "/expenses/new/deposit-request");
  await shot(page, "deposit_empty");

  if (page.url().includes("/login")) issue("CRITICAL", "입금요청 폼", "로그인 리다이렉트");

  // Title
  const title = page.locator('#title, input[placeholder*="외주"], input[placeholder*="제목"]').first();
  if (await vis(title)) { await title.fill("QA — 외주 디자인비"); console.log("✅ 제목 OK"); }
  else issue("CRITICAL", "입금요청 폼", "제목 필드 미발견");

  // Amount
  const amt = page.locator('#amount, input[placeholder="0"]').first();
  if (await vis(amt)) { await amt.fill("1000000"); await sleep(500); console.log("✅ 금액 OK"); }
  else issue("CRITICAL", "입금요청 폼", "금액 필드 미발견");

  // VAT
  const vat = page.locator('text=VAT 포함').first();
  if (await vis(vat)) {
    await vat.click(); await sleep(800);
    const b = await page.textContent("body");
    if (b.includes("공급가액") || b.includes("실지급액")) console.log("✅ VAT 내역 OK");
    else issue("HIGH", "입금요청 폼", "VAT 내역 미표시");
    await shot(page, "deposit_vat");
  } else issue("HIGH", "입금요청 폼", "VAT 체크박스 미발견");

  // Freelancer
  const fl = page.locator('text=프리랜서').first();
  if (await vis(fl)) { await fl.click(); await sleep(800); console.log("✅ 프리랜서 OK"); await shot(page, "deposit_freelancer"); }
  else issue("HIGH", "입금요청 폼", "프리랜서 체크박스 미발견");

  // Urgent
  const urg = page.locator('text=긴급').first();
  if (await vis(urg)) { await urg.click(); await sleep(500); console.log("✅ 긴급 OK"); }
  else issue("MEDIUM", "입금요청 폼", "긴급 체크박스 미발견");

  // Pre-paid
  const pp = page.locator('text=선지급').first();
  if (await vis(pp)) {
    await pp.click(); await sleep(800);
    const pb = page.locator('button >> text=부분').first();
    if (await vis(pb)) { await pb.click(); await sleep(800); console.log("✅ 선지급 부분 OK"); await shot(page, "deposit_prepaid"); }
    else issue("MEDIUM", "입금요청 폼", "선지급 부분 버튼 없음");
  } else issue("HIGH", "입금요청 폼", "선지급 체크박스 미발견");

  // Category
  const odd = page.locator('button >> text=ODD').first();
  if (await vis(odd)) { await odd.click(); await sleep(500); console.log("✅ ODD OK"); }
  else issue("HIGH", "입금요청 폼", "카테고리 ODD 버튼 없음");

  const ccBtn = page.locator('button >> text=직접 입력').first();
  if (await vis(ccBtn)) {
    await ccBtn.click(); await sleep(500);
    const ci = page.locator('input[placeholder*="카테고리"]').first();
    if (await vis(ci)) { await ci.fill("커스텀QA"); console.log("✅ 직접입력 OK"); if (await vis(odd)) await odd.click(); }
    else issue("MEDIUM", "입금요청 폼", "직접입력 input 미표시");
  } else issue("MEDIUM", "입금요청 폼", "직접입력 버튼 없음");

  // Description
  const desc = page.locator("textarea").first();
  if (await vis(desc)) { await desc.fill("QA 감사 테스트"); console.log("✅ 설명 OK"); }

  await shot(page, "deposit_basic");
  await page.evaluate(() => window.scrollBy(0, 500));
  await sleep(500);

  // Bank
  const bk = page.locator('button >> text=은행 선택').first();
  const bk2 = page.locator('[role="combobox"]').first();
  const bankEl = (await vis(bk)) ? bk : bk2;
  if (await vis(bankEl)) {
    await bankEl.click(); await sleep(800);
    const bs = page.locator('input[placeholder*="은행"]').first();
    if (await vis(bs)) {
      await bs.fill("카카오"); await sleep(800);
      await shot(page, "deposit_bank");
      const kk = page.locator('div >> text=카카오뱅크').first();
      if (await vis(kk)) { await kk.click(); await sleep(500); console.log("✅ 은행 OK"); }
      else issue("HIGH", "입금요청 폼", "카카오뱅크 미발견");
    } else issue("HIGH", "입금요청 폼", "은행 검색 input 미발견");
  } else issue("HIGH", "입금요청 폼", "은행 선택 버튼 미발견");

  // Account holder
  const ah = page.locator('#accountHolder, input[placeholder*="홍길동"], input[placeholder*="예금주"]').first();
  if (await vis(ah)) { await ah.fill("홍길동"); console.log("✅ 예금주 OK"); }
  else issue("CRITICAL", "입금요청 폼", "예금주 필드 미발견");

  // Account number
  const an = page.locator('#accountNumber, input[placeholder*="숫자만"]').first();
  if (await vis(an)) {
    await an.fill("abc123def456"); await sleep(300);
    const v = await an.inputValue();
    if (/[^0-9]/.test(v)) issue("HIGH", "입금요청 폼", `계좌번호 문자 허용: "${v}"`);
    else console.log(`✅ 계좌번호 숫자만 OK (${v})`);
    await an.fill("1234567890123");
  } else issue("CRITICAL", "입금요청 폼", "계좌번호 필드 미발견");

  // File — create a test file and attach it
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);
  const bf = await page.textContent("body");
  if (bf.includes("파일") || bf.includes("첨부") || bf.includes("드래그")) console.log("✅ 파일 첨부 영역 OK");
  else issue("HIGH", "입금요청 폼", "파일 첨부 영역 미발견");

  // Attach a real test file (deposit requires min 1 file)
  const fileInput = page.locator('input[type="file"]').first();
  const fileInputExists = (await fileInput.count()) > 0;
  if (fileInputExists) {
    const { writeFileSync: wfs, unlinkSync } = await import("fs");
    const testFilePath = "./e2e-screenshots/_test_receipt.png";
    const pngBuf = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    wfs(testFilePath, pngBuf);
    await fileInput.setInputFiles(testFilePath);
    await sleep(2000);
    // Scroll down to see the file preview + doc type selector
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(1000);
    // Select document type via shadcn/ui Select (custom trigger button)
    const docTypeTrigger = page.locator('button[aria-label="문서 유형 선택"]').first();
    if (await vis(docTypeTrigger)) {
      await docTypeTrigger.scrollIntoViewIfNeeded();
      await docTypeTrigger.click();
      await sleep(1000);
      // Click "영수증" option in the dropdown
      const receiptOption = page.locator('[role="option"]').filter({ hasText: "영수증" }).first();
      if (await vis(receiptOption)) {
        await receiptOption.click();
        await sleep(500);
        console.log("✅ 문서유형 선택 OK");
      } else {
        // Fallback: click first available option
        const anyOption = page.locator('[role="option"]').first();
        if (await vis(anyOption)) { await anyOption.click(); await sleep(500); console.log("✅ 문서유형 (fallback) OK"); }
        else console.log("⚠️ 문서유형 옵션 미발견");
      }
    } else {
      console.log("⚠️ 문서유형 트리거 미발견");
    }
    console.log("✅ 파일 첨부 OK");
    try { unlinkSync(testFilePath); } catch {}
  } else {
    issue("HIGH", "입금요청 폼", "파일 input 미발견");
  }

  await shot(page, "deposit_complete");

  // Submit
  console.log("  제출...");
  const sub = page.locator('button[type="submit"]').first();
  if (await vis(sub)) {
    await sub.scrollIntoViewIfNeeded(); await sub.click();
    // Wait for success dialog with retry (API + file upload may take time)
    let depositSubmitOk = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      await sleep(1500);
      const dialog = page.locator('[data-slot="dialog-content"]');
      if (await vis(dialog)) {
        const dt = await dialog.textContent();
        if (dt && (dt.includes("추가 제출") || dt.includes("비용관리") || dt.includes("제출 완료"))) {
          depositSubmitOk = true;
          break;
        }
      }
      // Also check body for error
      const ba = await page.textContent("body");
      if (ba && (ba.includes("오류") || ba.includes("실패했습니다"))) {
        issue("CRITICAL", "입금요청 폼", "제출 오류");
        depositSubmitOk = true; // marked to avoid duplicate issue
        break;
      }
    }
    await shot(page, "deposit_submitted");
    if (depositSubmitOk) {
      const ba = await page.textContent("body");
      if (ba && !ba.includes("오류")) console.log("✅ 입금요청 제출 성공");
    } else {
      issue("MEDIUM", "입금요청 폼", "제출 후 상태 불명확 (15초 대기 후)");
    }
    const gl = page.locator('button >> text=비용관리로 이동').first();
    if (await vis(gl)) { await gl.click(); await sleep(1500); }
  } else issue("CRITICAL", "입금요청 폼", "제출 버튼 미발견");

  // 4. CORPORATE CARD
  console.log("\n=== 4. 법카사용 폼 ===");
  await go(page, "/expenses/new/corporate-card");
  await shot(page, "corporate_empty");

  const co = page.locator('button >> text=ODD').first();
  if (await vis(co)) { console.log("✅ 법카 카테고리 버튼 토글"); await co.click(); }
  else issue("HIGH", "법카사용 폼", "카테고리 버튼 토글 아님");

  if (await vis(page.locator('text=VAT 포함').first())) console.log("✅ 법카 VAT 있음");
  else issue("HIGH", "법카사용 폼", "VAT 체크박스 없음");

  if (await vis(page.locator('text=프리랜서').first())) console.log("✅ 법카 프리랜서 있음");
  else issue("HIGH", "법카사용 폼", "프리랜서 체크박스 없음");

  if (await vis(page.locator('text=긴급').first())) console.log("✅ 법카 긴급 있음");
  else issue("MEDIUM", "법카사용 폼", "긴급 체크박스 없음");

  const ct2 = page.locator('#title, input[placeholder*="제목"]').first();
  if (await vis(ct2)) await ct2.fill("QA — 사무용품");
  const ca2 = page.locator('#amount, input[placeholder="0"]').first();
  if (await vis(ca2)) await ca2.fill("55000");
  const cd2 = page.locator("textarea").first();
  if (await vis(cd2)) await cd2.fill("법카 QA");
  const cm2 = page.locator('#merchantName, input[placeholder*="가맹점"]').first();
  if (await vis(cm2)) { await cm2.fill("쿠팡"); console.log("✅ 가맹점 OK"); }
  else issue("MEDIUM", "법카사용 폼", "가맹점명 미발견");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(500);
  await shot(page, "corporate_filled");

  const cs2 = page.locator('button[type="submit"]').first();
  if (await vis(cs2)) {
    await cs2.scrollIntoViewIfNeeded(); await cs2.click();
    // Wait for success dialog with retry
    let corpSubmitOk = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      await sleep(1500);
      const dialog = page.locator('[data-slot="dialog-content"]');
      if (await vis(dialog)) {
        const dt = await dialog.textContent();
        if (dt && (dt.includes("추가 제출") || dt.includes("비용관리") || dt.includes("제출 완료"))) {
          corpSubmitOk = true;
          break;
        }
      }
      const ba2 = await page.textContent("body");
      if (ba2 && ba2.includes("실패했습니다")) {
        issue("CRITICAL", "법카사용 폼", "제출 오류");
        corpSubmitOk = true;
        break;
      }
    }
    await shot(page, "corporate_submitted");
    if (corpSubmitOk) {
      const cbt = await page.textContent("body");
      if (cbt && !cbt.includes("오류")) console.log("✅ 법카 제출 성공");
    } else {
      issue("HIGH", "법카사용 폼", "제출 후 성공 다이얼로그 미표시");
    }
    const cg2 = page.locator('button >> text=비용관리로 이동').first();
    if (await vis(cg2)) { await cg2.click(); await sleep(1500); }
  }

  // 5. EXPENSE LIST
  console.log("\n=== 5. 비용 목록 재확인 ===");
  await go(page, "/expenses");
  await shot(page, "list_after");
  const rc = await page.locator("table tbody tr").count().catch(() => 0);
  console.log(`  행: ${rc}`);
  if (rc === 0) issue("CRITICAL", "비용 목록", "제출 후 목록 비어 있음");

  // 6. DETAIL
  console.log("\n=== 6. 비용 상세 ===");
  if (rc > 0) {
    const lnk = page.locator("table tbody tr a").first();
    if (await vis(lnk)) await lnk.click(); else await page.locator("table tbody tr").first().click();
    await sleep(3000);
    await shot(page, "detail");
  } else issue("HIGH", "비용 상세", "목록 비어서 불가");

  // 7~12 OTHER PAGES
  for (const pg of [
    { n: "admin", p: "/admin" }, { n: "pending", p: "/admin/pending" },
    { n: "notifications", p: "/notifications" }, { n: "settings", p: "/settings" },
    { n: "reports", p: "/admin/reports" }, { n: "users", p: "/admin/users" },
  ]) {
    console.log(`\n=== ${pg.n} ===`);
    await go(page, pg.p); await shot(page, pg.n);
  }

  // 13. MOBILE
  console.log("\n=== 13. 모바일 ===");
  await page.setViewportSize({ width: 375, height: 812 });
  for (const m of [
    { n: "m_home", p: "/" }, { n: "m_list", p: "/expenses" },
    { n: "m_deposit", p: "/expenses/new/deposit-request" },
    { n: "m_corp", p: "/expenses/new/corporate-card" },
  ]) {
    await go(page, m.p); await shot(page, m.n);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // SUMMARY
  console.log("\n========================================");
  console.log("📋 QA 감사 결과");
  console.log("========================================");
  console.log(`이슈: ${issues.length}건 (🔴${issues.filter((i) => i.severity === "CRITICAL").length} 🟠${issues.filter((i) => i.severity === "HIGH").length} 🟡${issues.filter((i) => i.severity === "MEDIUM").length})`);
  console.log(`콘솔에러: ${consoleErrors.length}건 / 네트워크오류: ${networkErrors.length}건`);
  if (consoleErrors.length) { console.log("\n--- 콘솔 에러 ---"); consoleErrors.slice(0, 15).forEach((e) => console.log(`  ${e.slice(0, 200)}`)); }
  if (networkErrors.length) { console.log("\n--- 네트워크 오류 ---"); networkErrors.slice(0, 15).forEach((e) => console.log(`  ${e.status} ${e.url.slice(0, 120)}`)); }
  console.log("\n--- 이슈 ---");
  issues.forEach((i, x) => {
    const ic = i.severity === "CRITICAL" ? "🔴" : i.severity === "HIGH" ? "🟠" : "🟡";
    console.log(`  ${x + 1}. ${ic} [${i.severity}] (${i.area}) ${i.description}`);
  });

  writeFileSync(`${DIR}/report.json`, JSON.stringify({ timestamp: new Date().toISOString(), summary: { total: issues.length, critical: issues.filter((i) => i.severity === "CRITICAL").length, high: issues.filter((i) => i.severity === "HIGH").length, medium: issues.filter((i) => i.severity === "MEDIUM").length }, issues, consoleErrors: consoleErrors.slice(0, 30), networkErrors: networkErrors.slice(0, 30) }, null, 2));
  console.log(`\n📄 ${DIR}/report.json`);
  console.log("✅ 완료! 브라우저 열어둡니다.");

  await new Promise((r) => { const iv = setInterval(async () => { try { await page.title(); } catch { clearInterval(iv); r(); } }, 1000); });
  await browser.close();
})();
