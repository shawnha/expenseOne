import { sql } from "drizzle-orm";
import { expenses } from "./schema";

/**
 * 부호 적용 금액 — 반품(REFUND)은 지출 차감이므로 합계 계산 시 음수로 처리.
 * 모든 sum(amount) 집계는 이 표현식을 사용해야 반품이 net으로 반영된다.
 * (amount 컬럼 자체는 CHECK(amount > 0) 제약 때문에 항상 양수로 저장)
 */
export const signedAmount = sql<number>`CASE WHEN ${expenses.type} = 'REFUND' THEN -${expenses.amount} ELSE ${expenses.amount} END`;
