/**
 * 입금요청 금액 계산(부가세·원천징수 토글 × KRW/USD) 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyVatAndWithholding,
  calcDepositAmount,
  calcDepositBreakdownKRW,
  FREELANCER_WITHHOLDING_RATE,
  resolveEditedAmount,
} from "./deposit-amount";
import { depositRequestFormSchema } from "../validations/expense-form";

/**
 * 수정 전 폼(deposit-request-form.tsx)의 calcFinalAmount 그대로.
 * KRW 동작이 바뀌지 않았음을 이걸 기준으로 고정한다.
 */
function legacyCalcFinalAmount(base: number, vat: boolean, freelancer: boolean): number {
  let result = base;
  if (vat) result = Math.round(result * 1.1);
  if (freelancer) result = Math.round(result * (1 - 0.033));
  return result;
}

/**
 * 수정 전 폼의 USD 토글 경로 그대로: 달러 공급가액을 센트로 바꾸지 않고
 * legacyCalcFinalAmount(달러, …)를 amount에 넣었다.
 */
function legacyUsdToggleAmount(dollars: number, vat: boolean, freelancer: boolean): number {
  return legacyCalcFinalAmount(dollars, vat, freelancer);
}

const amountField = depositRequestFormSchema.shape.amount;

/**
 * USD 토글 계약 — amount는 정수 센트여야 하고, 토글을 끄면 기본 센트로 돌아와야 한다.
 * 수정 후 구현은 통과하고, 수정 전 공식은 실패해야 한다(아래 두 테스트).
 */
function assertUsdToggleContract(
  amountFor: (dollars: number, vat: boolean, freelancer: boolean) => number,
): void {
  assert.equal(amountFor(100, true, false), 11_000, "$100 부가세 별도 → 11,000센트");
  assert.equal(amountFor(100, false, true), 9_670, "$100 원천징수 → 9,670센트");
  assert.equal(amountFor(100, true, true), 10_637, "$100 둘 다 → 10,637센트");
  const off = amountFor(100.5, false, false);
  assert.equal(off, 10_050, "$100.50 토글 끔 → 10,050센트");
  assert.equal(amountField.safeParse(off).success, true, "토글 끔 값이 정수 검증 통과");
}

describe("applyVatAndWithholding — 최소 단위 정수 계산", () => {
  it("상수가 3.3%다", () => {
    assert.equal(FREELANCER_WITHHOLDING_RATE, 0.033);
  });

  it("부가세만: +10% 반올림", () => {
    assert.equal(applyVatAndWithholding(100_000, true, false), 110_000);
    assert.equal(applyVatAndWithholding(1, true, false), 1); // round(1.1)
    assert.equal(applyVatAndWithholding(5, true, false), 6); // round(5.5)
  });

  it("원천징수만: -3.3% 반올림", () => {
    assert.equal(applyVatAndWithholding(100_000, false, true), 96_700);
    assert.equal(applyVatAndWithholding(1_000, false, true), 967);
  });

  it("둘 다: 부가세를 먼저 더한 뒤 원천징수", () => {
    // 110,000 × 0.967 = 106,370
    assert.equal(applyVatAndWithholding(100_000, true, true), 106_370);
  });

  it("아무것도 안 켜면 그대로", () => {
    assert.equal(applyVatAndWithholding(123_456, false, false), 123_456);
  });
});

describe("calcDepositAmount — KRW는 예전 계산과 완전히 같다", () => {
  const samples = [1, 7, 10, 33, 99, 100, 1_001, 12_345, 100_000, 1_500_000, 987_654_321];
  const toggles: [boolean, boolean][] = [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ];

  it("대표 금액 × 토글 4조합이 legacy와 일치", () => {
    for (const n of samples) {
      for (const [vat, fl] of toggles) {
        assert.equal(
          calcDepositAmount(n, "KRW", vat, fl),
          legacyCalcFinalAmount(n, vat, fl),
          `KRW ${n} vat=${vat} fl=${fl}`,
        );
      }
    }
  });

  it("1~20,000원 전 구간 × 토글 4조합이 legacy와 일치 (반올림 경계 포함)", () => {
    for (let n = 1; n <= 20_000; n++) {
      for (const [vat, fl] of toggles) {
        const got = calcDepositAmount(n, "KRW", vat, fl);
        const want = legacyCalcFinalAmount(n, vat, fl);
        if (got !== want) {
          assert.fail(`KRW ${n} vat=${vat} fl=${fl}: got ${got}, legacy ${want}`);
        }
      }
    }
  });

  it("KRW 100,000원 + 부가세 별도 = 110,000원 (폼 스키마 통과)", () => {
    const v = calcDepositAmount(100_000, "KRW", true, false);
    assert.equal(v, 110_000);
    assert.equal(amountField.safeParse(v).success, true);
  });
});

describe("calcDepositAmount — USD는 센트로 바꾼 뒤 배율", () => {
  it("계약: 수정 후 helper는 USD 토글 계약을 지킨다", () => {
    assertUsdToggleContract((d, vat, fl) => calcDepositAmount(d, "USD", vat, fl));
  });

  it("계약: 수정 전 토글 공식은 같은 계약에서 실패한다 (회귀 테스트가 버그를 잡는다는 증거)", () => {
    assert.throws(() => assertUsdToggleContract(legacyUsdToggleAmount), assert.AssertionError);
  });

  it("$100: 기본 10,000센트, 부가세 11,000, 원천징수 9,670, 둘 다 10,637", () => {
    assert.equal(calcDepositAmount(100, "USD", false, false), 10_000);
    assert.equal(calcDepositAmount(100, "USD", true, false), 11_000);
    assert.equal(calcDepositAmount(100, "USD", false, true), 9_670);
    assert.equal(calcDepositAmount(100, "USD", true, true), 10_637);
  });

  it("수정 전 버그 재현: 달러 단위에 배율을 곱하면 100분의 1(110센트 = $1.10)", () => {
    // 예전 토글 경로 = legacyCalcFinalAmount(달러, …)를 센트 변환 없이 저장
    const before = legacyUsdToggleAmount(100, true, false);
    const after = calcDepositAmount(100, "USD", true, false);
    assert.equal(before, 110); // $1.10 로 저장되던 값
    assert.equal(after, 11_000); // $110.00
    assert.equal(after, before * 100);
  });

  it("소수 달러($100.50): 토글 끄면 100.5가 아니라 10,050센트(정수)로 돌아온다", () => {
    const supply = 100.5;
    const base = calcDepositAmount(supply, "USD", false, false);
    assert.equal(base, 10_050);
    assert.equal(Number.isInteger(base), true);

    // 수정 전: 토글을 끄면 달러 소수 100.5가 amount로 들어가 int 검증 실패
    const legacyOff = legacyUsdToggleAmount(supply, false, false);
    assert.equal(legacyOff, 100.5);
    assert.equal(amountField.safeParse(legacyOff).success, false);

    // 수정 후: 정수 센트라 통과
    assert.equal(amountField.safeParse(base).success, true);
  });

  it("토글 순서: 켜기 → 끄기 → 다시 켜기가 상태 누적 없이 같은 값", () => {
    const supply = 249.99; // 24,999센트
    const base = calcDepositAmount(supply, "USD", false, false);
    assert.equal(base, 24_999);

    const vatOn = calcDepositAmount(supply, "USD", true, false);
    assert.equal(vatOn, 27_499); // round(24,999 × 1.1 = 27,498.9)

    const vatOff = calcDepositAmount(supply, "USD", false, false);
    assert.equal(vatOff, base);

    const bothOn = calcDepositAmount(supply, "USD", true, true);
    assert.equal(bothOn, 26_592); // round(27,499 × 0.967 = 26,591.533)

    const flOffKeepVat = calcDepositAmount(supply, "USD", true, false);
    assert.equal(flOffKeepVat, vatOn);

    const allOff = calcDepositAmount(supply, "USD", false, false);
    assert.equal(allOff, base);
  });

  it("부가세는 KRW 원 단위 계산과 같은 규칙으로 센트 단위에서 반올림된다", () => {
    // $33.33 = 3,333센트 → ×1.1 = 3,666.3 → 3,666 → ×0.967 = 3,545.022 → 3,545
    assert.equal(calcDepositAmount(33.33, "USD", true, false), 3_666);
    assert.equal(calcDepositAmount(33.33, "USD", true, true), 3_545);
    // $0.01 → 1센트 → round(1.1) = 1
    assert.equal(calcDepositAmount(0.01, "USD", true, false), 1);
    // $0.05 → 5센트 → round(5.5) = 6
    assert.equal(calcDepositAmount(0.05, "USD", true, false), 6);
  });

  it("USD 결과는 어떤 소수 입력·토글에서도 정수 센트(폼 스키마 통과)", () => {
    const toggles: [boolean, boolean][] = [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ];
    // 0.01 ~ 500.00 달러를 1센트 단위로
    for (let cents = 1; cents <= 50_000; cents++) {
      const dollars = cents / 100;
      for (const [vat, fl] of toggles) {
        const v = calcDepositAmount(dollars, "USD", vat, fl);
        if (!Number.isInteger(v) || v <= 0) {
          assert.fail(`USD ${dollars} vat=${vat} fl=${fl}: ${v}`);
        }
      }
    }
    assert.equal(amountField.safeParse(calcDepositAmount(0.07, "USD", true, true)).success, true);
  });

  it("USD 기본 경로는 dollarsToCents(Math.round(달러 × 100))와 같은 반올림", () => {
    assert.equal(calcDepositAmount(1.005, "USD", false, false), Math.round(1.005 * 100));
    assert.equal(calcDepositAmount(19.99, "USD", false, false), 1_999);
    assert.equal(calcDepositAmount(0.1 + 0.2, "USD", false, false), 30);
  });
});

describe("calcDepositAmount — 통화 문자열", () => {
  it("USD 외(KRW·빈 문자열)는 원 단위 그대로", () => {
    assert.equal(calcDepositAmount(1_000, "KRW", true, false), 1_100);
    assert.equal(calcDepositAmount(1_000, "", true, false), 1_100);
  });

  it("0이면 토글과 무관하게 0", () => {
    assert.equal(calcDepositAmount(0, "KRW", true, true), 0);
    assert.equal(calcDepositAmount(0, "USD", true, true), 0);
  });
});

// ---------------------------------------------------------------------------
// 수정 화면 — 이미 차감된 금액에 3.3%를 또 빼던 버그
// ---------------------------------------------------------------------------
describe("resolveEditedAmount — 수정 화면", () => {
  it("토글을 건드리지 않았으면 입력한 숫자가 곧 저장 금액", () => {
    // 원천징수 100,000원 요청 → DB amount 96,700(net). 수정 화면은 96,700을
    // 보여주고 원천징수 토글이 켜진 채로 뜬다. 예전엔 금액 칸을 건드리기만 해도
    // 93,508(= 96,700 × 0.967)이 저장됐다.
    const stored = 96_700;
    assert.equal(resolveEditedAmount(stored, false, false, true), stored);
    // 저장할 때마다 줄어들던 것: 여러 번 반복해도 그대로다.
    let amount = stored;
    for (let i = 0; i < 5; i++) amount = resolveEditedAmount(amount, false, false, true);
    assert.equal(amount, stored);
    // 예전 동작이었다면 한 번 저장할 때마다 3.3%씩 줄었다.
    assert.equal(calcDepositAmount(stored, "KRW", false, true), 93_509);
  });

  it("토글을 건드리지 않았으면 부가세 플래그가 켜져 있어도 그대로", () => {
    assert.equal(resolveEditedAmount(50_000, false, true, true), 50_000);
  });

  it("토글을 실제로 건드리면 입력값을 공급가액으로 보고 배율을 적용한다", () => {
    assert.equal(resolveEditedAmount(100_000, true, true, false), 110_000);
    assert.equal(resolveEditedAmount(100_000, true, false, true), 96_700);
    assert.equal(resolveEditedAmount(100_000, true, true, true), 106_370);
    // 생성 폼과 같은 헬퍼를 쓴다(복제본 없음).
    assert.equal(
      resolveEditedAmount(100_000, true, true, true),
      calcDepositAmount(100_000, "KRW", true, true),
    );
  });

  it("0은 토글과 무관하게 0", () => {
    assert.equal(resolveEditedAmount(0, true, true, true), 0);
    assert.equal(resolveEditedAmount(0, false, true, true), 0);
  });
});

// ---------------------------------------------------------------------------
// 화면 요약 — 서버와 같은 순서로 계산하는가
// ---------------------------------------------------------------------------

/** 서버 경로: expense.service createExpense → convertToKRW(cents, rate). */
function serverStoredKRW(
  supply: number,
  currency: string,
  vat: boolean,
  freelancer: boolean,
  rate: number,
): number {
  const amount = calcDepositAmount(supply, currency, vat, freelancer);
  // exchange-rate.service.ts:277-278
  return currency === "USD" ? Math.round((amount / 100) * rate) : amount;
}

describe("calcDepositBreakdownKRW", () => {
  it("USD 실지급액이 서버 저장값과 정확히 같다", () => {
    const rate = 1387.5;
    for (const supply of [100, 100.5, 100.55, 0.01, 9999.99]) {
      for (const vat of [false, true]) {
        for (const fl of [false, true]) {
          const bd = calcDepositBreakdownKRW(supply, "USD", vat, fl, rate);
          assert.ok(bd, `$${supply}`);
          assert.equal(
            bd.finalKRW,
            serverStoredKRW(supply, "USD", vat, fl, rate),
            `$${supply} vat=${vat} fl=${fl}`,
          );
        }
      }
    }
  });

  it("예전 화면 공식(환산 먼저)과는 갈리고, 서버와 맞는 쪽을 쓴다", () => {
    const rate = 1387.5;
    const bd = calcDepositBreakdownKRW(100.55, "USD", true, false, rate)!;
    const legacyDisplay = Math.round(Math.round(100.55 * rate) * 1.1); // 153,464
    assert.equal(legacyDisplay, 153_464);
    assert.equal(bd.finalKRW, 153_471);
    assert.equal(bd.finalKRW, serverStoredKRW(100.55, "USD", true, false, rate));
  });

  it("환율을 못 받은 USD는 null — 달러 숫자를 원화처럼 보여주지 않는다", () => {
    assert.equal(calcDepositBreakdownKRW(100, "USD", false, false, null), null);
    assert.equal(calcDepositBreakdownKRW(100, "USD", true, false, 0), null);
    // 예전 화면은 여기서 baseKRW = 100(달러 숫자)로 떨어져 "$100 → 100원"을 보여줬다.
  });

  it("KRW는 환율 없이도 계산되고 값이 예전과 같다", () => {
    const bd = calcDepositBreakdownKRW(100_000, "KRW", true, true, null)!;
    assert.equal(bd.baseKRW, 100_000);
    assert.equal(bd.vatKRW, 10_000);
    assert.equal(bd.totalBeforeWithholdingKRW, 110_000);
    assert.equal(bd.withholdingKRW, 3_630);
    assert.equal(bd.finalKRW, 106_370);
    assert.equal(bd.finalKRW, calcDepositAmount(100_000, "KRW", true, true));
  });

  it("줄이 서로 더해진다 (base + VAT = 총액, 총액 - 원천징수 = 실지급액)", () => {
    for (const [cur, rate] of [["KRW", null], ["USD", 1387.5]] as const) {
      for (const supply of [1, 7, 100.55, 12_345]) {
        for (const vat of [false, true]) {
          for (const fl of [false, true]) {
            const bd = calcDepositBreakdownKRW(supply, cur, vat, fl, rate)!;
            assert.equal(bd.baseKRW + bd.vatKRW, bd.totalBeforeWithholdingKRW);
            assert.equal(bd.totalBeforeWithholdingKRW - bd.withholdingKRW, bd.finalKRW);
            if (!vat) assert.equal(bd.vatKRW, 0);
            if (!fl) assert.equal(bd.withholdingKRW, 0);
          }
        }
      }
    }
  });
});
