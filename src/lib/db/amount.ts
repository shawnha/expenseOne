import { sql } from "drizzle-orm";
import { expenses } from "./schema";

/**
 * 부호 적용 금액 — 반품(REFUND)은 지출 차감이므로 합계 계산 시 음수로 처리.
 * 모든 sum(amount) 집계는 이 표현식을 사용해야 반품이 net으로 반영된다.
 * (amount 컬럼 자체는 CHECK(amount > 0) 제약 때문에 항상 양수로 저장)
 */
export const signedAmount = sql<number>`CASE WHEN ${expenses.type} = 'REFUND' THEN -${expenses.amount} ELSE ${expenses.amount} END`;

/**
 * 지출 유형 — 반품은 원거래의 유형(법카/입금요청)으로 돌려 센다.
 * 그래야 「법카 + 입금요청 = 합계」가 맞는다. 원거래가 없으면 NULL(어느 쪽에도 안 들어감).
 */
export const spendType = sql<"CORPORATE_CARD" | "DEPOSIT_REQUEST" | null>`(CASE WHEN ${expenses.type} = 'REFUND'
  THEN (SELECT o.type::text FROM ${expenses} o WHERE o.id = ${expenses.originalExpenseId})
  ELSE ${expenses.type}::text END)`;

/**
 * 실제로 나간 돈만 — 승인된 건, 반품은 원거래도 승인 상태일 때만.
 * 대기·반려·취소는 빠진다. 대시보드·리포트 금액은 모두 이 조건을 쓴다(홈 화면도 승인만 센다).
 */
export const isSpend = sql`(${expenses.status} = 'APPROVED' AND (${expenses.type} <> 'REFUND'
  OR EXISTS (SELECT 1 FROM ${expenses} o WHERE o.id = ${expenses.originalExpenseId} AND o.status = 'APPROVED')))`;
