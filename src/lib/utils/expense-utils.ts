import { CATEGORY_OPTIONS } from "@/lib/validations/expense-form";

/**
 * 금액을 KRW 형식 문자열로 포맷 (예: "1,000원")
 */
export function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/**
 * 카테고리 코드에서 한국어 라벨을 반환
 */
export function getCategoryLabel(category: string): string {
  return CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? category;
}
