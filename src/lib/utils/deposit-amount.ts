// ---------------------------------------------------------------------------
// 입금요청 금액 계산 — 폼의 `amount` 필드 값(KRW는 원 정수, USD는 센트 정수)을
// 한곳에서 만든다. 서버(expense.service createExpense)는 USD면 이 값을
// amountOriginal(센트)로 저장하고 환율을 곱해 원화 amount를 만든다.
//
// 버그(검토 2026-09-18 5-3절): USD에서 「부가세 별도」·「원천징수」를 켜면
// 달러 단위 공급가액(예: 100)에 배율을 곱한 값(110)이 센트 변환 없이 amount로
// 들어가 100분의 1($1.10)로 저장됐고, 끄면 달러 소수(100.5)가 그대로 들어가
// 정수 검증에 걸렸다. 금액 입력 경로는 센트로 바꿨지만 토글 경로는 아니었다.
//
// 그래서 통화별 **최소 단위(원·센트) 정수로 먼저 바꾼 뒤** 배율을 적용한다.
// KRW는 예전 폼의 calcFinalAmount와 같은 계산이다(단위 테스트로 고정).
// ---------------------------------------------------------------------------
import { dollarsToCents } from "@/lib/validations/expense-form";
import { VAT_RATE } from "./vat";

/** 프리랜서 원천징수율(3.3%). */
export const FREELANCER_WITHHOLDING_RATE = 0.033;

/**
 * 최소 단위 정수(원 또는 센트)에 부가세(+10%) → 원천징수(-3.3%)를 순서대로 적용.
 * 각 단계에서 반올림하므로 결과는 항상 정수다.
 */
export function applyVatAndWithholding(
  baseMinor: number,
  vat: boolean,
  freelancer: boolean,
): number {
  let result = baseMinor;
  if (vat) result = Math.round(result * (1 + VAT_RATE));
  if (freelancer) result = Math.round(result * (1 - FREELANCER_WITHHOLDING_RATE));
  return result;
}

/**
 * 입력 금액(KRW 원 / USD 달러) + 토글 → `amount` 필드 값.
 *
 * - KRW: `supply`(원 정수)에 그대로 배율 적용.
 * - USD: `supply`(달러, 소수 2자리)를 센트로 바꾼 뒤 배율 적용 → 정수 센트.
 *
 * 토글을 껐다 켜도 같은 입력에서 같은 값이 나오므로(상태 누적 없음)
 * 끄면 기본 금액(센트)으로 정확히 돌아온다.
 */
export function calcDepositAmount(
  supply: number,
  currency: string,
  vat: boolean,
  freelancer: boolean,
): number {
  const baseMinor = currency === "USD" ? dollarsToCents(supply) : supply;
  return applyVatAndWithholding(baseMinor, vat, freelancer);
}

/** 화면 요약(원화)용 내역. 모든 값은 원 단위 정수. */
export interface DepositBreakdownKRW {
  /** 부가세 전 원화 금액 (USD면 환산 후). */
  baseKRW: number;
  /** 부가세분(원). 켜지 않았으면 0. */
  vatKRW: number;
  /** 부가세까지 반영한 원화 금액 — 선지급 계산의 '총 금액'. */
  totalBeforeWithholdingKRW: number;
  /** 원천징수분(원). 켜지 않았으면 0. */
  withholdingKRW: number;
  /** 실지급액(원). **서버가 저장할 amount와 같은 값**. */
  finalKRW: number;
}

/**
 * 화면에 보여줄 원화 내역. 서버와 **같은 순서**로 계산한다.
 *
 * 예전 화면 계산은 '원화로 먼저 환산 → 배율'이었는데 서버는
 * '센트에 배율 → convertToKRW'다(exchange-rate.service.ts:277-278). 라운딩
 * 지점이 달라 USD 건에서 제출 직후 상세 화면 금액이 방금 본 숫자와 몇 원
 * 어긋났다. 여기서는 최소 단위로 단계별 계산을 끝낸 뒤 각 단계를 환산해서
 * `finalKRW`가 서버 저장값과 정확히 일치하게 한다.
 *
 * @param rate USD 환율. USD인데 환율을 못 받았으면 `null`을 돌려준다 —
 *   달러 숫자를 그대로 원화로 보여주면(예: $100 → 100원) 사용자가 금액을
 *   잘못 입력한 줄 안다. 호출부는 요약 대신 안내 문구를 띄운다.
 */
export function calcDepositBreakdownKRW(
  supply: number,
  currency: string,
  vat: boolean,
  freelancer: boolean,
  rate: number | null,
): DepositBreakdownKRW | null {
  const isUSD = currency === "USD";
  if (isUSD && (rate == null || !(rate > 0))) return null;

  const baseMinor = isUSD ? dollarsToCents(supply) : supply;
  const afterVatMinor = vat ? Math.round(baseMinor * (1 + VAT_RATE)) : baseMinor;
  const finalMinor = freelancer
    ? Math.round(afterVatMinor * (1 - FREELANCER_WITHHOLDING_RATE))
    : afterVatMinor;

  // 서버의 convertToKRW와 같은 식: round(cents / 100 * rate).
  const toKRW = (minor: number) => (isUSD ? Math.round((minor / 100) * (rate as number)) : minor);

  const baseKRW = toKRW(baseMinor);
  const totalBeforeWithholdingKRW = toKRW(afterVatMinor);
  const finalKRW = toKRW(finalMinor);

  return {
    baseKRW,
    // 줄이 서로 더해지도록 차액으로 낸다(환산 후 기준).
    vatKRW: totalBeforeWithholdingKRW - baseKRW,
    totalBeforeWithholdingKRW,
    withholdingKRW: totalBeforeWithholdingKRW - finalKRW,
    finalKRW,
  };
}

/**
 * **수정 화면**에서 입력한 숫자 → 저장할 `amount`.
 *
 * 생성 화면과 달리 수정 화면은 공급가액을 모른다. DB에서 읽는 건 이미
 * 부가세·원천징수가 반영된 최종 금액뿐이고, 원천징수 플래그도 켜진 채로 뜬다.
 * 그 상태에서 입력값에 배율을 다시 걸면 저장할 때마다 3.3%씩 깎인다
 * (100,000 → 96,700 → 93,508 → …).
 *
 * 그래서 사용자가 이 화면에서 **토글을 실제로 건드렸을 때만**(`calcActive`)
 * 입력값을 공급가액으로 보고 배율을 적용한다. 건드리기 전이면 입력한 숫자가
 * 곧 최종 금액이다.
 */
export function resolveEditedAmount(
  typed: number,
  calcActive: boolean,
  vat: boolean,
  freelancer: boolean,
): number {
  return calcActive ? calcDepositAmount(typed, "KRW", vat, freelancer) : typed;
}
