import { eq, sql } from "drizzle-orm";
import type { ExpensePurposeFilter, ExpenseSpendView } from "@/lib/admin/expense-purpose";
import { spendType } from "./amount";
import { expensePurposes, expenses } from "./schema";

/** 반품의 비용 성격은 원거래를 따라간다. */
const purposeExpenseId = sql`CASE WHEN ${expenses.type} = 'REFUND' THEN ${expenses.originalExpenseId} ELSE ${expenses.id} END`;
export const expensePurposeJoin = eq(expensePurposes.expenseId, purposeExpenseId);

export function expensePurposeCondition(purpose: ExpensePurposeFilter) {
  const matching = sql`SELECT 1 FROM ${expensePurposes} WHERE ${expensePurposeJoin}`;
  return purpose === "unclassified"
    ? sql`NOT EXISTS (${matching})`
    : sql`EXISTS (${matching} AND ${expensePurposes.purpose} = ${purpose})`;
}

export function dashboardSpendKind(view: ExpenseSpendView) {
  if (view === "card") return sql`${spendType} = 'CORPORATE_CARD'`;
  if (view === "deposit") return sql`${spendType} = 'DEPOSIT_REQUEST'`;
  return sql`${spendType} IN ('CORPORATE_CARD', 'DEPOSIT_REQUEST')`;
}
