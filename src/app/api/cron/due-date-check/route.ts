import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenses, users } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { sendPushToAdmins } from "@/services/push.service";
import { formatExpenseAmount } from "@/lib/utils/expense-utils";
import { verifyCronAuth } from "@/lib/cron-auth";

// ---------------------------------------------------------------------------
// Cron — 납입 기일 임박 알림
// Vercel Cron이 매일 오전 9시(KST) 호출.
// 7일/3일/1일/당일 전의 SUBMITTED 입금요청을 조회해 관리자에게 알림.
// ---------------------------------------------------------------------------

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getReminderLabel(daysUntil: number): { emoji: string; text: string } {
  if (daysUntil === 0) return { emoji: "🚨", text: "오늘이 납입 기일입니다" };
  if (daysUntil === 1) return { emoji: "⚠️", text: "내일이 납입 기일입니다" };
  if (daysUntil === 3) return { emoji: "⏰", text: "납입 기일 3일 전입니다" };
  return { emoji: "📅", text: "납입 기일 1주일 전입니다" };
}

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const today = new Date();
  const reminderDays = [7, 3, 1, 0];
  const targetDates = reminderDays.map((d) => ({ days: d, date: addDays(today, d) }));

  // Get all admin user IDs
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));

  if (admins.length === 0) {
    return NextResponse.json({ ok: true, message: "no admins", triggered: 0 });
  }
  const adminIds = admins.map((a) => a.id);

  let notifiedCount = 0;
  const results: Array<{ expenseId: string; daysUntil: number; title: string }> = [];

  for (const { days, date } of targetDates) {
    // Find SUBMITTED expenses with due_date matching this target date
    const matchingExpenses = await db
      .select({
        id: expenses.id,
        title: expenses.title,
        amount: expenses.amount,
        currency: expenses.currency,
        amountOriginal: expenses.amountOriginal,
        dueDate: expenses.dueDate,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.type, "DEPOSIT_REQUEST"),
          eq(expenses.status, "SUBMITTED"),
          eq(expenses.dueDate, date),
        ),
      );

    for (const exp of matchingExpenses) {
      const { emoji, text } = getReminderLabel(days);
      const title = `${emoji} ${text}`;
      const amountText = formatExpenseAmount(exp.amount, exp.currency, exp.amountOriginal);
      const message = `${exp.title} — ${amountText}`;

      // Dedup identity = (relatedExpenseId, type, title, recipientId).
      // Title encodes the days-until bucket (emoji prefix), so each of the
      // 7/3/1/0 reminders is its own notification. Migration 0004 added a
      // partial unique index covering exactly that tuple. ON CONFLICT must
      // restate the partial-index predicate (Drizzle's helper API doesn't
      // expose `WHERE` for the conflict target), so we drop to raw SQL.
      const valuesSql = adminIds
        .map(
          (id) => sql`(
            gen_random_uuid(),
            ${id},
            'DUE_DATE_REMINDER',
            ${title},
            ${message},
            ${exp.id},
            false,
            now()
          )`,
        )
        .reduce((acc, cur, i) => (i === 0 ? cur : sql`${acc}, ${cur}`));

      const insertedRaw = await db.execute<{ id: string }>(sql`
        INSERT INTO expenseone.notifications
          (id, recipient_id, type, title, message, related_expense_id, is_read, created_at)
        VALUES ${valuesSql}
        ON CONFLICT (related_expense_id, type, title, recipient_id)
          WHERE type = 'DUE_DATE_REMINDER'
          DO NOTHING
        RETURNING id
      `);
      const inserted = Array.from(insertedRaw as Iterable<{ id: string }>);

      if (inserted.length > 0) {
        notifiedCount += inserted.length;

        // Web Push fire-and-forget — push duplicates are tolerable, in-app
        // duplicates are what we actually guard against above.
        sendPushToAdmins(title, message, `/expenses/${exp.id}`).catch((err) => {
          console.error("[DueDateCron] Push failed:", err);
        });

        results.push({ expenseId: exp.id, daysUntil: days, title: exp.title });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    checkedAt: today.toISOString(),
    notifiedCount,
    results,
  });
}
