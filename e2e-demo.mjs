import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SLOW = 600; // ms between actions so you can watch

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const browser = await chromium.launch({
    headless: false,
    slowMo: SLOW,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log("🔵 1. 로그인 페이지 이동...");
  await page.goto(BASE + "/login");
  await page.waitForLoadState("networkidle");
  await sleep(1500);

  // Google SSO 버튼 클릭
  console.log("🔵 2. Google SSO 로그인...");
  const googleBtn = page.locator('button:has-text("Google"), a:has-text("Google")').first();
  if (await googleBtn.isVisible()) {
    await googleBtn.click();
    // Google OAuth 팝업/리다이렉트를 기다림 — 사용자가 수동으로 로그인 완료
    console.log("⏳ Google 로그인을 완료해주세요... (30초 대기)");
    await page.waitForURL("**/expenses**", { timeout: 60000 }).catch(() => {});
    // 혹시 대시보드로 리다이렉트되면
    await page.waitForURL(BASE + "/**", { timeout: 5000 }).catch(() => {});
  }

  await sleep(2000);

  // 이미 로그인되어있으면 대시보드로 이동
  if (!page.url().includes("/expenses") && !page.url().includes("/login")) {
    console.log("🔵 대시보드로 이동...");
    await page.goto(BASE);
    await page.waitForLoadState("networkidle");
    await sleep(1500);
  }

  // ===== 비용 목록 확인 =====
  console.log("🔵 3. 비용 목록 페이지 확인...");
  await page.goto(BASE + "/expenses");
  await page.waitForLoadState("networkidle");
  await sleep(2000);

  // 필터 확인 — select가 "전체"로 표시되는지
  console.log("🔵 4. 필터 드롭다운 확인 (전체 유형/상태/카테고리)...");
  await sleep(1500);

  // ===== 입금요청 제출 =====
  console.log("🔵 5. 입금요청 폼으로 이동...");
  await page.goto(BASE + "/expenses/new/deposit-request");
  await page.waitForLoadState("networkidle");
  await sleep(2000);

  // 제목 입력
  console.log("🔵 6. 폼 작성 시작...");
  const titleInput = page.locator('input[name="title"], input[placeholder*="제목"]').first();
  if (await titleInput.isVisible()) {
    await titleInput.fill("Playwright 테스트 — 외주 개발비");
  }
  await sleep(500);

  // 설명 입력
  const descInput = page.locator('textarea[name="description"], textarea[placeholder*="설명"]').first();
  if (await descInput.isVisible()) {
    await descInput.fill("Playwright 자동화 테스트로 작성된 입금요청입니다.");
  }
  await sleep(500);

  // 금액 입력
  console.log("🔵 7. 금액 입력 + VAT 체크...");
  const amountInput = page.locator('input[name="amount"], input[inputmode="numeric"]').first();
  if (await amountInput.isVisible()) {
    await amountInput.fill("1000000");
  }
  await sleep(800);

  // VAT 체크박스 클릭
  const vatCheckbox = page.locator('text=VAT').first();
  if (await vatCheckbox.isVisible()) {
    await vatCheckbox.click();
    await sleep(1000);
  }

  // 프리랜서 원천징수 체크
  console.log("🔵 8. 프리랜서 원천징수 체크...");
  const freelancerCheckbox = page.locator('text=프리랜서').first();
  if (await freelancerCheckbox.isVisible()) {
    await freelancerCheckbox.click();
    await sleep(1000);
  }

  // 긴급 체크
  console.log("🔵 9. 긴급 체크...");
  const urgentCheckbox = page.locator('text=긴급').first();
  if (await urgentCheckbox.isVisible()) {
    await urgentCheckbox.click();
    await sleep(800);
  }

  // 카테고리 선택 (ODD 버튼)
  console.log("🔵 10. 카테고리 선택 (ODD)...");
  const oddBtn = page.locator('button:has-text("ODD")').first();
  if (await oddBtn.isVisible()) {
    await oddBtn.click();
    await sleep(800);
  }

  // 스크롤 다운
  await page.evaluate(() => window.scrollBy(0, 400));
  await sleep(500);

  // 은행명 선택
  console.log("🔵 11. 은행명 검색 (카카오)...");
  const bankBtn = page.locator('button:has-text("은행 선택"), button:has-text("은행명")').first();
  if (await bankBtn.isVisible()) {
    await bankBtn.click();
    await sleep(800);

    // 검색 입력
    const bankSearch = page.locator('input[placeholder*="은행"]').first();
    if (await bankSearch.isVisible()) {
      await bankSearch.fill("카카오");
      await sleep(800);

      // 카카오뱅크 선택
      const kakaoBank = page.locator('text=카카오뱅크').first();
      if (await kakaoBank.isVisible()) {
        await kakaoBank.click();
        await sleep(500);
      }
    }
  }

  // 예금주 입력
  console.log("🔵 12. 계좌 정보 입력...");
  const holderInput = page.locator('input[name="accountHolder"], input[placeholder*="예금주"]').first();
  if (await holderInput.isVisible()) {
    await holderInput.fill("홍길동");
  }
  await sleep(500);

  // 계좌번호 입력
  const accountInput = page.locator('input[name="accountNumber"], input[placeholder*="계좌"]').first();
  if (await accountInput.isVisible()) {
    await accountInput.fill("1234567890123");
  }
  await sleep(500);

  // 스크롤 다운 더
  await page.evaluate(() => window.scrollBy(0, 400));
  await sleep(500);

  // 선지급 체크
  console.log("🔵 13. 선지급 체크 (부분 50%)...");
  const prePaidCheckbox = page.locator('text=선지급').first();
  if (await prePaidCheckbox.isVisible()) {
    await prePaidCheckbox.click();
    await sleep(800);

    // 부분 선지급 선택
    const partialBtn = page.locator('button:has-text("부분"), label:has-text("부분")').first();
    if (await partialBtn.isVisible()) {
      await partialBtn.click();
      await sleep(1000);
    }
  }

  // 스크롤 끝까지
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);

  console.log("🔵 14. 폼 작성 완료! 제출 버튼을 확인합니다...");

  // 제출 버튼 하이라이트 (클릭하지는 않음 — 사용자가 확인 후 결정)
  const submitBtn = page.locator('button[type="submit"], button:has-text("제출")').first();
  if (await submitBtn.isVisible()) {
    await submitBtn.scrollIntoViewIfNeeded();
    // 테두리 하이라이트
    await submitBtn.evaluate((el) => {
      el.style.outline = "3px solid #007AFF";
      el.style.outlineOffset = "2px";
    });
    await sleep(1000);

    console.log("🔵 15. 제출 버튼 클릭...");
    await submitBtn.click();
    await sleep(3000);
  }

  // ===== 법카사용 제출 =====
  console.log("🔵 16. 법카사용 폼으로 이동...");
  await page.goto(BASE + "/expenses/new/corporate-card");
  await page.waitForLoadState("networkidle");
  await sleep(2000);

  // 제목
  const ccTitle = page.locator('input[name="title"], input[placeholder*="제목"]').first();
  if (await ccTitle.isVisible()) {
    await ccTitle.fill("Playwright 테스트 — 사무용품 구매");
  }
  await sleep(500);

  // 설명
  const ccDesc = page.locator('textarea[name="description"], textarea[placeholder*="설명"]').first();
  if (await ccDesc.isVisible()) {
    await ccDesc.fill("법인카드 사용 테스트 건");
  }
  await sleep(500);

  // 금액
  const ccAmount = page.locator('input[name="amount"], input[inputmode="numeric"]').first();
  if (await ccAmount.isVisible()) {
    await ccAmount.fill("55000");
  }
  await sleep(500);

  // 가맹점명
  const merchantInput = page.locator('input[name="merchantName"], input[placeholder*="가맹점"]').first();
  if (await merchantInput.isVisible()) {
    await merchantInput.fill("쿠팡");
  }
  await sleep(500);

  // 카드 끝 4자리
  const cardInput = page.locator('input[name="cardLastFour"], input[placeholder*="카드"]').first();
  if (await cardInput.isVisible()) {
    await cardInput.fill("1234");
  }
  await sleep(500);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(1000);

  // 제출
  console.log("🔵 17. 법카사용 제출...");
  const ccSubmit = page.locator('button[type="submit"], button:has-text("제출")').first();
  if (await ccSubmit.isVisible()) {
    await ccSubmit.click();
    await sleep(3000);
  }

  // ===== 비용 목록 재확인 =====
  console.log("🔵 18. 비용 목록으로 이동하여 결과 확인...");
  await page.goto(BASE + "/expenses");
  await page.waitForLoadState("networkidle");
  await sleep(3000);

  // ===== 관리자 대시보드 =====
  console.log("🔵 19. 관리자 대시보드 확인...");
  await page.goto(BASE + "/admin");
  await page.waitForLoadState("networkidle");
  await sleep(2000);

  // 승인 대기 목록
  console.log("🔵 20. 승인 대기 목록 확인...");
  await page.goto(BASE + "/admin/pending");
  await page.waitForLoadState("networkidle");
  await sleep(2000);

  console.log("✅ 데모 완료! 브라우저를 열어둡니다. 직접 확인하세요.");
  console.log("   브라우저를 닫으면 스크립트가 종료됩니다.");

  // 브라우저가 닫힐 때까지 대기
  await new Promise((resolve) => {
    const interval = setInterval(async () => {
      try {
        await page.title();
      } catch {
        clearInterval(interval);
        resolve();
      }
    }, 1000);
  });

  await browser.close();
})();
