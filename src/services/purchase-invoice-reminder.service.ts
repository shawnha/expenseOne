import { db } from "@/lib/db";
import { expenses, purchaseInvoiceLines, users } from "@/lib/db/schema";
import { and, eq, isNull, lte, inArray } from "drizzle-orm";
import { sendPushToAdmins } from "@/services/push.service";
import { notifySlackDirect, notifySlackText } from "@/services/slack.service";
import { deriveInvoiceAmounts, invoiceDueDate } from "@/services/expense.service";
import {
  buildReminderPush,
  buildReminderSlackText,
  stageForToday,
  type ReminderLine,
} from "@/lib/purchase-invoice-reminder";

// ---------------------------------------------------------------------------
// 사입 세금계산서 미발행 알림 (매일 오전 9시 KST, due-date-check cron이 함께 호출)
//
// 사용자가 발행을 두 번 놓쳤다. 화면에 목록이 있어도 **보러 가지 않으면**
// 소용이 없어서, 기한이 다가오면 먼저 찾아가 알린다. 단계·문장은 lib/purchase-invoice-reminder.ts.
//
// 지연을 매일 보내는 건 의도적이다. 놓친 대가가 알림 몇 번보다 크고,
// 발행 완료를 누르는 순간 즉시 멈춘다.
//
// Slack 은 #99-expenses 채널이 아니라 오너에게 DM(2026-10-01 오너 요청) — 관리 업무라 채널 전체가
// 볼 일이 아니다. DM 이 실패하면(사용자 조회 실패 등) 예전처럼 채널에 올린다: 이 알림은 조용히
// 사라지면 안 된다(두 번 놓친 경로).
// ---------------------------------------------------------------------------

/** DM 받을 사람. 바꾸려면 환경변수로(배포 없이). */
const REMINDER_DM_EMAIL = process.env.INVOICE_REMINDER_DM_EMAIL?.trim() || "shawn@hanah1.com";

/** KST 기준 오늘 날짜 조각. Vercel은 UTC로 돌기 때문에 직접 환산한다. */
function todayKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, d, isLastDay: d === lastDay };
}

export { stageForToday };

export async function runInvoiceReminder() {
  const stage = stageForToday(todayKST());
  if (!stage) {
    return { skipped: true, reason: "알림 단계가 아닌 날" } as const;
  }

  // 대상 월까지의 미발행 사입 줄 — 그 달만이 아니라 **그 이전까지 전부** 본다.
  // 한 달을 통째로 놓치면 다음 달이 대상이 되면서 옛 건이 조용히 사라지는데,
  // 그게 바로 사용자가 두 번 놓친 경로다.
  const [ey, em] = stage.ym.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(ey, em, 0)).toISOString().slice(0, 10);

  // 미발행 **줄**을 센다. 한 사입에 약국이 여럿이면 계산서도 여러 장이라
  // 건수가 아니라 줄 수가 실제 할 일의 크기다.
  const rows = await db
    .select({
      expenseId: expenses.id,
      transactionDate: expenses.transactionDate,
      title: expenses.title,
      submitterName: users.name,
      pharmacyName: purchaseInvoiceLines.pharmacyName,
      supplyAmount: purchaseInvoiceLines.supplyAmount,
      vatAmount: purchaseInvoiceLines.vatAmount,
    })
    .from(purchaseInvoiceLines)
    .innerJoin(expenses, eq(expenses.id, purchaseInvoiceLines.expenseId))
    .leftJoin(users, eq(users.id, expenses.submittedById))
    .where(
      and(
        eq(expenses.isPurchase, true),
        isNull(purchaseInvoiceLines.invoiceIssuedAt),
        inArray(expenses.status, ["SUBMITTED", "APPROVED"]),
        lte(expenses.transactionDate, monthEnd),
      ),
    );

  if (rows.length === 0) {
    return { sent: false, stage: stage.kind, count: 0 } as const;
  }

  const lines: ReminderLine[] = rows.map((r) => ({
    expenseId: r.expenseId,
    transactionDate: String(r.transactionDate ?? "").slice(0, 10),
    title: r.title,
    submitterName: r.submitterName ?? null,
    pharmacyName: r.pharmacyName,
    total: deriveInvoiceAmounts(r.supplyAmount, r.vatAmount).total,
  }));
  const total = lines.reduce((acc, l) => acc + l.total, 0);
  const dueDate = invoiceDueDate(stage.ym);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://expenseone.vercel.app";
  const link = `${appUrl}/admin/purchase-invoice`;
  const push = buildReminderPush(stage, lines.length, total, dueDate);
  const text = buildReminderSlackText(stage, lines, { appUrl, dueDate });

  /** 수동 실행(/api/cron/invoice-reminder) 결과로 어디로 갔는지 보이게. */
  const delivery: { slack: "dm" | "channel" | "none" } = { slack: "none" };
  await Promise.allSettled([
    sendPushToAdmins(`${push.emoji} ${push.title}`, push.body, link),
    (async () => {
      if (await notifySlackDirect(REMINDER_DM_EMAIL, text)) {
        delivery.slack = "dm";
        return;
      }
      console.error("[InvoiceReminder] DM 실패 — 채널로 대신 올립니다.");
      if (await notifySlackText(text)) delivery.slack = "channel";
    })(),
  ]);

  return { sent: true, stage: stage.kind, ym: stage.ym, count: lines.length, total, slack: delivery.slack } as const;
}
