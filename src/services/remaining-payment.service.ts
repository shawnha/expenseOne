import { and, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { remainingPaymentDates } from "@/lib/db/remaining-payment-dates";

export function recordRemainingPaymentAction(expenseId: string, action: "request" | "approve") {
  const isRequest = action === "request";
  return db.transaction(async (tx) => {
    const occurredAt = new Date();
    const change = isRequest ? { remainingPaymentRequested: true } : { remainingPaymentApproved: true };
    const [updated] = await tx.update(expenses)
      .set({ ...change, updatedAt: occurredAt })
      .where(and(
        eq(expenses.id, expenseId),
        eq(expenses.type, "DEPOSIT_REQUEST"),
        eq(expenses.status, "APPROVED"),
        eq(expenses.isPrePaid, true),
        eq(expenses.remainingPaymentRequested, !isRequest),
        eq(expenses.remainingPaymentApproved, false),
        isRequest ? lt(expenses.prePaidPercentage, 100) : undefined,
      ))
      .returning();
    if (!updated) return null;

    const dates = isRequest ? { requestedAt: occurredAt, approvedAt: null } : { approvedAt: occurredAt };
    await tx.insert(remainingPaymentDates).values({ expenseId, ...dates })
      .onConflictDoUpdate({ target: remainingPaymentDates.expenseId, set: dates });
    return updated;
  });
}
