import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { and, eq, isNull, lte, inArray } from "drizzle-orm";
import { sendPushToAdmins } from "@/services/push.service";
import { notifySlackText } from "@/services/slack.service";
import { deriveInvoiceAmounts, invoiceDueDate } from "@/services/expense.service";

// ---------------------------------------------------------------------------
// 사입 세금계산서 미발행 알림 (매일 오전 9시 KST, due-date-check cron이 함께 호출)
//
// 사용자가 발행을 두 번 놓쳤다. 화면에 목록이 있어도 **보러 가지 않으면**
// 소용이 없어서, 기한이 다가오면 먼저 찾아가 알린다.
//
// 발행 주기는 월말 일괄, 기한은 익월 10일이다. 그래서 한 달치가 끝난 뒤부터
// 기한까지 몇 번, 기한을 넘기면 매일 알린다.
//
//   말일        예고 — "이번 달 사입 N건, 곧 발행하셔야 합니다"
//   1·5·8일     리마인더 — 남은 날짜와 함께
//   10일        마감일 🚨
//   11일 이후   지연 — 발행할 때까지 매일
//
// 지연을 매일 보내는 건 의도적이다. 놓친 대가가 알림 몇 번보다 크고,
// 발행 완료를 누르는 순간 즉시 멈춘다.
// ---------------------------------------------------------------------------

/** KST 기준 오늘 날짜 조각. Vercel은 UTC로 돌기 때문에 직접 환산한다. */
function todayKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  const d = kst.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, d, isLastDay: d === lastDay };
}

/** yyyy-mm 문자열에서 개월 수를 뺀다. */
function shiftMonth(y: number, m: number, delta: number): string {
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

type Stage =
  | { kind: "preview"; ym: string }
  | { kind: "remind"; ym: string; daysLeft: number }
  | { kind: "due"; ym: string }
  | { kind: "overdue"; ym: string; daysLate: number }
  | null;

/** 오늘이 어떤 단계인지. 대상 월(ym)도 함께 돌려준다. */
export function stageForToday(t: { y: number; m: number; d: number; isLastDay: boolean }): Stage {
  const thisMonth = `${t.y}-${String(t.m).padStart(2, "0")}`;
  const prevMonth = shiftMonth(t.y, t.m, -1);

  // 말일: 이번 달 매입분 예고
  if (t.isLastDay) return { kind: "preview", ym: thisMonth };

  // 익월 1~10일: 지난달 매입분이 대상
  if (t.d === 1 || t.d === 5 || t.d === 8) {
    return { kind: "remind", ym: prevMonth, daysLeft: 10 - t.d };
  }
  if (t.d === 10) return { kind: "due", ym: prevMonth };
  if (t.d > 10) return { kind: "overdue", ym: prevMonth, daysLate: t.d - 10 };

  return null;
}

function buildMessage(stage: NonNullable<Stage>, count: number, total: number) {
  const amount = `${total.toLocaleString("ko-KR")}원`;
  const ymLabel = stage.ym.replace("-", ".");
  switch (stage.kind) {
    case "preview":
      return {
        emoji: "📋",
        title: "사입 세금계산서 발행 예정",
        body: `${ymLabel} 사입 ${count}건 (${amount}). 발행 기한은 ${invoiceDueDate(stage.ym).replaceAll("-", ".")}입니다.`,
      };
    case "remind":
      return {
        emoji: "⏰",
        title: "사입 세금계산서 미발행",
        body: `${ymLabel} 미발행 ${count}건 (${amount}). 발행 기한까지 ${stage.daysLeft}일 남았습니다.`,
      };
    case "due":
      return {
        emoji: "🚨",
        title: "오늘이 사입 계산서 발행 기한",
        body: `${ymLabel} 미발행 ${count}건 (${amount}). 오늘까지 발행하셔야 합니다.`,
      };
    case "overdue":
      return {
        emoji: "🔴",
        title: "사입 계산서 발행 기한 초과",
        body: `${ymLabel} 미발행 ${count}건 (${amount}). 기한을 ${stage.daysLate}일 넘겼습니다.`,
      };
  }
}

export async function runInvoiceReminder() {
  const today = todayKST();
  const stage = stageForToday(today);
  if (!stage) {
    return { skipped: true, reason: "알림 단계가 아닌 날" } as const;
  }

  // 대상 월의 미발행 사입 건.
  //
  // 지연(overdue) 단계에서는 **그 달만이 아니라 그 이전까지 전부** 본다.
  // 한 달을 통째로 놓치면 다음 달이 대상이 되면서 옛 건이 조용히 사라지는데,
  // 그게 바로 사용자가 두 번 놓친 경로다.
  const [ey, em] = stage.ym.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(ey, em, 0)).toISOString().slice(0, 10);

  const rows = await db
    .select({
      supplyAmount: expenses.supplyAmount,
      transactionDate: expenses.transactionDate,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.isPurchase, true),
        isNull(expenses.invoiceIssuedAt),
        inArray(expenses.status, ["SUBMITTED", "APPROVED"]),
        lte(expenses.transactionDate, monthEnd),
      ),
    );

  if (rows.length === 0) {
    return { sent: false, stage: stage.kind, count: 0 } as const;
  }

  const total = rows.reduce(
    (acc, r) => acc + deriveInvoiceAmounts(r.supplyAmount ?? 0).total,
    0,
  );
  const msg = buildMessage(stage, rows.length, total);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://expenseone.vercel.app";
  const link = `${appUrl}/admin/purchase-invoice`;

  await Promise.allSettled([
    sendPushToAdmins(`${msg.emoji} ${msg.title}`, msg.body, link),
    notifySlackText(`${msg.emoji} *${msg.title}*\n${msg.body}\n<${link}|발행 관리 열기>`),
  ]);

  return { sent: true, stage: stage.kind, ym: stage.ym, count: rows.length, total } as const;
}
