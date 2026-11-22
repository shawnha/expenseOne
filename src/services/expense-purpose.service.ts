import { and, eq, gte, lte, ne, sql } from "drizzle-orm";
import type { ExpensePurpose, ExpenseSpendView } from "@/lib/admin/expense-purpose";
import { db } from "@/lib/db";
import { isSpend, signedAmount } from "@/lib/db/amount";
import { dashboardSpendKind, expensePurposeJoin } from "@/lib/db/expense-purpose";
import { expensePurposes, expenses } from "@/lib/db/schema";
import { getCompanyBySlug } from "./company.service";

export async function getCategoryPurposeBreakdown(category: string, range: { startDate: string; endDate: string }, view: ExpenseSpendView, companySlug: string | null) {
  const company = companySlug ? await getCompanyBySlug(companySlug) : null;
  const rows = await db.select({
    purpose: sql<ExpensePurpose | null>`${expensePurposes.purpose}`,
    amount: sql<string>`coalesce(sum(${signedAmount}), 0)`,
    count: sql<number>`count(*)::int`,
  }).from(expenses)
    .leftJoin(expensePurposes, expensePurposeJoin)
    .where(and(
      eq(expenses.category, category),
      gte(expenses.transactionDate, range.startDate),
      lte(expenses.transactionDate, range.endDate),
      company ? eq(expenses.companyId, company.id) : undefined,
      isSpend,
      dashboardSpendKind(view),
    ))
    .groupBy(expensePurposes.purpose);

  return {
    range,
    items: rows.map((row) => ({ ...row, amount: Number(row.amount) })).sort((a, b) => b.amount - a.amount),
  };
}

export async function getExpensePurpose(expenseId: string): Promise<ExpensePurpose | null> {
  const [row] = await db.select({ purpose: sql<ExpensePurpose>`${expensePurposes.purpose}` })
    .from(expensePurposes).where(eq(expensePurposes.expenseId, expenseId)).limit(1);
  return row?.purpose ?? null;
}

export async function setExpensePurpose(expenseId: string, purpose: ExpensePurpose | null, adminId: string) {
  return db.transaction(async (tx) => {
    const [expense] = await tx.select({ id: expenses.id }).from(expenses)
      .where(and(eq(expenses.id, expenseId), ne(expenses.type, "REFUND"))).for("key share");
    if (!expense) return false;
    if (purpose === null) {
      await tx.delete(expensePurposes).where(eq(expensePurposes.expenseId, expenseId));
    } else {
      await tx.insert(expensePurposes).values({ expenseId, purpose, updatedBy: adminId })
        .onConflictDoUpdate({
          target: expensePurposes.expenseId,
          set: { purpose, updatedBy: adminId, updatedAt: sql`now()` },
        });
    }
    return true;
  });
}
