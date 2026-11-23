import { and, eq, exists, gte, isNull, lte, or, sql, type SQLWrapper } from "drizzle-orm";
import { check, timestamp, uuid } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { expenseSchema, expenses } from "@/lib/db/schema";

export const remainingPaymentDates = expenseSchema.table(
  "expense_remaining_payment_dates",
  {
    expenseId: uuid("expense_id").primaryKey(),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (table) => [check("expense_remaining_payment_dates_check", sql`${table.requestedAt} IS NOT NULL OR ${table.approvedAt} IS NOT NULL`)],
);

function currentCycle(timestamp: SQLWrapper) {
  return or(isNull(expenses.approvedAt), gte(timestamp, expenses.approvedAt));
}

function kstDate(timestamp: SQLWrapper) {
  return sql`(${timestamp} AT TIME ZONE 'Asia/Seoul')::date`;
}

const hasRemainingRequest = and(
  eq(expenses.type, "DEPOSIT_REQUEST"),
  eq(expenses.status, "APPROVED"),
  eq(expenses.isPrePaid, true),
  eq(expenses.remainingPaymentRequested, true),
);
const isRecordedApproval = and(eq(expenses.remainingPaymentApproved, true), currentCycle(remainingPaymentDates.approvedAt));

export interface RemainingPaymentDateLabels {
  requestedOn: string | null;
  approvedOn: string | null;
}

export const remainingPaymentDateLabels = sql<RemainingPaymentDateLabels | null>`(
  SELECT jsonb_build_object(
    'requestedOn', CASE WHEN ${currentCycle(remainingPaymentDates.requestedAt)} THEN ${kstDate(remainingPaymentDates.requestedAt)} END,
    'approvedOn', CASE WHEN ${isRecordedApproval} THEN ${kstDate(remainingPaymentDates.approvedAt)} END
  ) FROM ${remainingPaymentDates}
  WHERE ${remainingPaymentDates.expenseId} = ${expenses.id} AND ${hasRemainingRequest}
)`;

export function expenseDateRange(start: string | undefined, end: string | undefined, includeRemaining: boolean) {
  if (!start && !end) return undefined;

  function withinRange(value: SQLWrapper) {
    return and(start ? gte(value, start) : undefined, end ? lte(value, end) : undefined);
  }

  const original = withinRange(expenses.transactionDate);
  if (!includeRemaining) return original;

  return or(original, and(
    hasRemainingRequest,
    exists(db.select({ one: sql`1` }).from(remainingPaymentDates).where(and(
      eq(remainingPaymentDates.expenseId, expenses.id),
      or(
        and(currentCycle(remainingPaymentDates.requestedAt), withinRange(kstDate(remainingPaymentDates.requestedAt))),
        and(isRecordedApproval, withinRange(kstDate(remainingPaymentDates.approvedAt))),
      ),
    ))),
  ));
}
