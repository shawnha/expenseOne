import { CATEGORY_OPTIONS } from "@/lib/validations/expense-form";

/**
 * 금액을 KRW 형식 문자열로 포맷 (예: "1,000원")
 */
export function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/**
 * USD 센트를 달러 문자열로 포맷 (예: 150000 → "$1,500.00")
 */
export function formatUSD(amountCents: number): string {
  return `$${(amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 비용의 통화별 표시 포맷.
 * USD: "$1,500.00 (₩2,078,250)"
 * KRW: "2,078,250원"
 */
export function formatExpenseAmount(
  amountKrw: number,
  currency?: string | null,
  amountOriginal?: number | null,
): string {
  if (currency === "USD" && amountOriginal != null) {
    return `${formatUSD(amountOriginal)} (₩${amountKrw.toLocaleString("ko-KR")})`;
  }
  return formatKRW(amountKrw);
}

/**
 * 카테고리 코드에서 한국어 라벨을 반환
 */
export function getCategoryLabel(category: string): string {
  return CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? category;
}
