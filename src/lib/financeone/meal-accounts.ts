/**
 * 식비 자동분류에 사용되는 FinanceOne 메타데이터.
 *
 * - COMPANY_TO_ENTITY: ExpenseOne 회사 slug → financeone.entities.id
 * - MEAL_LEAF_CODES: 자동분류 대상으로 인정하는 internal_accounts.code 목록
 *   (entity별로 같은 code가 다른 의미일 수 있어 entity_id와 함께 조회한다)
 *
 * 회식(EXP-030-003)은 의도적으로 제외 — 가맹점명이 식당이지만 회식이 아닌
 * 케이스(클라이언트 미팅 등)와의 오분류 위험이 커서 수동 제출 흐름을 유지.
 */

export const COMPANY_TO_ENTITY: Record<string, number> = {
  hoi: 1,
  korea: 2,
  retail: 3,
};

/** 자동분류 대상으로 인정할 internal_accounts.code 화이트리스트. */
export const MEAL_LEAF_CODES: ReadonlySet<string> = new Set([
  "EXP-030-001", // 식비 / 점심
  "EXP-030-002", // 간식/커피
  "EXP-093-001", // 약국식비 (한아원코리아)
  "EXP-094-001", // 리테일식비 (한아원코리아)
]);

export function getEntityIdForCompanySlug(slug: string | null | undefined): number | null {
  if (!slug) return null;
  return COMPANY_TO_ENTITY[slug] ?? null;
}
