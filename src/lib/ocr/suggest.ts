/**
 * OCR 결과 → 폼에 넣을 금액·계좌 후보. 여기서는 무엇을 제안할지만 계산한다.
 * 입금요청 폼은 2026-10-26 오너 결정으로 **빈 칸이면 바로 넣고 띠로 확인 + 제출 전 요약**을 받는다
 * (lib/deposit-prefill). 값이 이미 있으면 「적용」 칩으로 남는다. 법카 폼은 지금처럼 칩만(원장 금액이 기준).
 */
import type { OcrFields } from "./types";
import { applyVatAndWithholding } from "@/lib/utils/deposit-amount";
import { normalizeBankName, type BankName } from "@/lib/banks";
import { accountKey } from "@/lib/utils/autofill";

export interface AmountSuggestion {
  /** 폼 금액 칸에 들어갈 값(공급가 또는 합계, 원) */
  base: number;
  /** true면 폼을 「부가세 별도」로 두고 base에 10%를 더한다 */
  vatExclusive: boolean;
  /** 부가세까지 반영한 금액(원천징수 전) — 칩에 보여 줄 값 */
  total: number;
}

const isWon = (n: number | null): n is number => n !== null && Number.isInteger(n) && n > 0;

/**
 * 원화 문서에서 금액 제안. 외화·금액 없음이면 null.
 * - 공급가+부가세가 따로 있고 폼 계산(공급가×1.1 반올림)과 맞으면 → 공급가 + 「부가세 별도」
 * - VAT 별도 금액만 적힌 문서(견적서 등) → 그 금액 + 「부가세 별도」 (폼이 10%를 더해 보여 준다)
 * - 그 밖에 합계가 있으면 → 합계 + 「부가세 포함」
 */
export function suggestAmountKRW(f: OcrFields): AmountSuggestion | null {
  if (f.currency && f.currency.toUpperCase() !== "KRW") return null;

  const total = isWon(f.totalAmount) ? f.totalAmount : null;
  const supply = isWon(f.supplyAmount) ? f.supplyAmount : null;
  const vat = f.vatAmount !== null && Number.isInteger(f.vatAmount) && f.vatAmount >= 0 ? f.vatAmount : null;

  if (supply !== null && vat !== null && vat > 0) {
    const computed = applyVatAndWithholding(supply, true, false);
    // 폼이 만드는 금액이 문서 합계(없으면 공급가+부가세)와 같을 때만 공급가 방식으로 제안
    const docTotal = total ?? supply + vat;
    if (computed === docTotal) return { base: supply, vatExclusive: true, total: computed };
  }

  // 문서 부가세 끝수가 폼 반올림과 달라 공급가 방식이 안 맞으면, 문서의 공급가+부가세를 합계로 쓴다
  if (total === null && supply !== null && vat !== null && vat > 0) {
    return { base: supply + vat, vatExclusive: false, total: supply + vat };
  }
  if (total === null) return null;
  if (f.amountIncludesVat === "no") {
    return { base: total, vatExclusive: true, total: applyVatAndWithholding(total, true, false) };
  }
  return { base: total, vatExclusive: false, total };
}

export interface AccountSuggestion {
  /** 목록 이름으로 못 맞추면 null — 은행은 직원이 고른다 */
  bankName: BankName | null;
  accountHolder: string;
  /** 숫자만 (폼 계좌 칸과 같은 형식) */
  accountNumber: string;
}

/** 예금주와 계좌번호(숫자 8자리 이상)가 다 있을 때만 제안 */
export function suggestAccount(f: OcrFields): AccountSuggestion | null {
  const holder = f.accountHolder?.trim();
  const number = accountKey(f.accountNumber);
  if (!holder || number.length < 8) return null;
  return { bankName: normalizeBankName(f.bankName), accountHolder: holder, accountNumber: number };
}

/** 법카(GoWid) 결제 금액과 영수증 원화 합계가 다르면 영수증 금액, 같거나 비교 불가면 null */
export function cardAmountMismatch(f: OcrFields, cardAmountKRW: number): number | null {
  if (f.currency && f.currency.toUpperCase() !== "KRW") return null;
  if (!isWon(f.totalAmount) || !(cardAmountKRW > 0)) return null;
  return f.totalAmount === cardAmountKRW ? null : f.totalAmount;
}
