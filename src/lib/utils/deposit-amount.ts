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
