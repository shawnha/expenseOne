import { db } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { notifySlackApproved } from "./slack.service";
import { sendPushToUser, sendPushToAdmins } from "./push.service";

// ---------------------------------------------------------------------------
// createNotification
// ---------------------------------------------------------------------------
export async function createNotification(data: {
  recipientId: string;
  type: "DEPOSIT_APPROVED" | "DEPOSIT_REJECTED" | "NEW_DEPOSIT_REQUEST" | "REMAINING_PAYMENT_REQUEST" | "REMAINING_PAYMENT_APPROVED" | "NEW_USER_JOINED";
  title: string;
  message: string;
  relatedExpenseId?: string | null;
}) {
  const [notification] = await db
    .insert(notifications)
    .values({
      recipientId: data.recipientId,
      type: data.type,
      title: data.title,
      message: data.message,
      relatedExpenseId: data.relatedExpenseId ?? null,
    })
    .returning();

  return notification;
}

// ---------------------------------------------------------------------------
// getNotifications -- paginated list for a user
// ---------------------------------------------------------------------------
export async function getNotifications(
  userId: string,
  page = 1,
  limit = 20,
) {
  const offset = (page - 1) * limit;

  const [items, totalResult] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(eq(notifications.recipientId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(notifications)
      .where(eq(notifications.recipientId, userId)),
  ]);

  const total = totalResult[0]?.count ?? 0;

  return {
    data: items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ---------------------------------------------------------------------------
// getUnreadCount
// ---------------------------------------------------------------------------
export async function getUnreadCount(userId: string): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, userId),
        eq(notifications.isRead, false),
      ),
    );

  return result[0]?.count ?? 0;
}

// ---------------------------------------------------------------------------
// markAsRead -- single notification
// ---------------------------------------------------------------------------
export async function markAsRead(notificationId: string, userId: string) {
  const [updated] = await db
    .update(notifications)
    .set({
      isRead: true,
      readAt: new Date(),
    })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientId, userId),
      ),
    )
    .returning();

  return updated ?? null;
}

// ---------------------------------------------------------------------------
// markAllAsRead
// ---------------------------------------------------------------------------
export async function markAllAsRead(userId: string) {
  await db
    .update(notifications)
    .set({
      isRead: true,
      readAt: new Date(),
    })
    .where(
      and(
        eq(notifications.recipientId, userId),
        eq(notifications.isRead, false),
      ),
    );
}

// ---------------------------------------------------------------------------
// Helper: build expense URL
// ---------------------------------------------------------------------------
function expenseUrl(expenseId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://expenseone.vercel.app";
  return `${base}/expenses/${expenseId}`;
}

// ---------------------------------------------------------------------------
// notifyExpenseApproved -- send approval notification to submitter
// ---------------------------------------------------------------------------
export async function notifyExpenseApproved(
  submitterId: string,
  expenseId: string,
  expenseTitle: string,
  extra?: {
    amount: number;
    approverName: string;
    submitterName: string;
    submitterEmail: string;
    companyId?: string | null;
  },
) {
  const notification = await createNotification({
    recipientId: submitterId,
    type: "DEPOSIT_APPROVED",
    title: "입금요청이 승인되었습니다",
    message: `"${expenseTitle}" 입금요청이 승인되었습니다.`,
    relatedExpenseId: expenseId,
  });

  // Await Slack + Push to prevent Vercel serverless from killing them
  const sideEffects: Promise<void>[] = [];

  if (extra) {
    sideEffects.push(
      notifySlackApproved({
        submitterEmail: extra.submitterEmail,
        submitterName: extra.submitterName,
        approverName: extra.approverName,
        title: expenseTitle,
        amount: extra.amount,
        expenseUrl: expenseUrl(expenseId),
        companyId: extra.companyId ?? undefined,
      }).catch((err) => console.error("[Slack] 승인 알림 실패:", err)),
    );
  }

  sideEffects.push(
    sendPushToUser(
      submitterId,
      "입금요청 승인",
      `"${expenseTitle}" 입금요청이 승인되었습니다.`,
      expenseUrl(expenseId),
    ).catch((err) => console.error("[Push] 승인 알림 실패:", err)),
  );

  await Promise.allSettled(sideEffects);

  return notification;
}

// ---------------------------------------------------------------------------
// notifyExpenseRejected -- send rejection notification to submitter
// ---------------------------------------------------------------------------
export async function notifyExpenseRejected(
  submitterId: string,
  expenseId: string,
  expenseTitle: string,
  rejectionReason: string,
  extra?: {
    amount: number;
    rejecterName: string;
    submitterName: string;
    submitterEmail: string;
  },
) {
  const notification = await createNotification({
    recipientId: submitterId,
    type: "DEPOSIT_REJECTED",
    title: "입금요청이 반려되었습니다",
    message: `"${expenseTitle}" 입금요청이 반려되었습니다. 사유: ${rejectionReason}`,
    relatedExpenseId: expenseId,
  });

  // Await Push to prevent Vercel serverless from killing it
  await sendPushToUser(
    submitterId,
    "입금요청 반려",
    `"${expenseTitle}" 입금요청이 반려되었습니다.`,
    expenseUrl(expenseId),
  ).catch((err) => console.error("[Push] 반려 알림 실패:", err));

  return notification;
}

// ---------------------------------------------------------------------------
// notifyNewDepositRequest -- notify all ADMINs about a new deposit request
// ---------------------------------------------------------------------------
export async function notifyNewDepositRequest(
  expenseId: string,
  expenseTitle: string,
  submitterName: string,
  extra?: {
    amount: number;
    category: string;
    submitterEmail: string;
    companyId?: string | null;
  },
) {
  // Find all active ADMINs
  const admins = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));

  if (admins.length === 0) return [];

  const notificationValues = admins.map((admin) => ({
    recipientId: admin.id,
    type: "NEW_DEPOSIT_REQUEST" as const,
    title: "새 입금요청이 등록되었습니다",
    message: `${submitterName}님이 "${expenseTitle}" 입금요청을 제출했습니다.`,
    relatedExpenseId: expenseId,
  }));

  const created = await db
    .insert(notifications)
    .values(notificationValues)
    .returning();

  // Await Push to prevent Vercel serverless from killing it
  const pushAmount = extra?.amount
    ? `${extra.amount.toLocaleString()}원`
    : "";
  await sendPushToAdmins(
    "새 입금요청",
    `${submitterName} - "${expenseTitle}" ${pushAmount}`,
    expenseUrl(expenseId),
  ).catch((err) => console.error("[Push] 새 입금요청 알림 실패:", err));

  return created;
}
