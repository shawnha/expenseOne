import { db } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";
import { eq, and, desc, count, lt, sql, inArray } from "drizzle-orm";
import { notifySlackApproved } from "./slack.service";
import { sendPushToUser, sendPushToAdmins } from "./push.service";

// ---------------------------------------------------------------------------
// createNotification
// ---------------------------------------------------------------------------
export async function createNotification(data: {
  recipientId: string;
  type: "DEPOSIT_APPROVED" | "DEPOSIT_REJECTED" | "NEW_DEPOSIT_REQUEST" | "REMAINING_PAYMENT_REQUEST" | "REMAINING_PAYMENT_APPROVED" | "NEW_USER_JOINED" | "GOWID_NEW_TRANSACTION";
  title: string;
  message: string;
  relatedExpenseId?: string | null;
  linkUrl?: string | null;
}) {
  const [notification] = await db
    .insert(notifications)
    .values({
      recipientId: data.recipientId,
      type: data.type,
      title: data.title,
      message: data.message,
      relatedExpenseId: data.relatedExpenseId ?? null,
      linkUrl: data.linkUrl ?? null,
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
  // 첫 페이지 조회 시 오래된 알림 정리 (비동기, 응답 차단 안 함)
  if (page === 1) {
    cleanupNotifications(userId).catch(() => {});
  }

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
// cleanupNotifications -- 30일 지난 읽은 알림 삭제 + 최대 200건 유지
// ---------------------------------------------------------------------------
const MAX_NOTIFICATIONS = 200;
const CLEANUP_DAYS = 30;

export async function cleanupNotifications(userId: string) {
  try {
    // 1) 30일 지난 읽은 알림 삭제
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CLEANUP_DAYS);

    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.recipientId, userId),
          eq(notifications.isRead, true),
          lt(notifications.createdAt, cutoff),
        ),
      );

    // 2) 200건 초과 시 오래된 읽은 알림부터 삭제
    const totalResult = await db
      .select({ count: count() })
      .from(notifications)
      .where(eq(notifications.recipientId, userId));

    const total = totalResult[0]?.count ?? 0;

    if (total > MAX_NOTIFICATIONS) {
      const excess = total - MAX_NOTIFICATIONS;
      // 읽은 알림 중 가장 오래된 것부터 삭제
      const oldReadIds = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.recipientId, userId),
            eq(notifications.isRead, true),
          ),
        )
        .orderBy(notifications.createdAt)
        .limit(excess);

      if (oldReadIds.length > 0) {
        await db
          .delete(notifications)
          .where(
            inArray(
              notifications.id,
              oldReadIds.map((r) => r.id),
            ),
          );
      }
    }
  } catch (err) {
    console.error("[Notification Cleanup] 실패:", err);
  }
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
    accountHolder?: string | null;
    isUrgent?: boolean;
    dueDate?: string | null;
    description?: string | null;
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
        accountHolder: extra.accountHolder,
        isUrgent: extra.isUrgent,
        dueDate: extra.dueDate,
        description: extra.description,
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
    isUrgent?: boolean;
    currency?: string | null;
    amountOriginal?: number | null;
  },
) {
  // Find all active ADMINs
  const admins = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));

  if (admins.length === 0) return [];

  const urgentPrefix = extra?.isUrgent ? "🚨 [긴급] " : "";

  const notificationValues = admins.map((admin) => ({
    recipientId: admin.id,
    type: "NEW_DEPOSIT_REQUEST" as const,
    title: `${urgentPrefix}새 입금요청이 등록되었습니다`,
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
    `${urgentPrefix}새 입금요청`,
    `${submitterName} - "${expenseTitle}" ${pushAmount}`,
    expenseUrl(expenseId),
  ).catch((err) => console.error("[Push] 새 입금요청 알림 실패:", err));

  return created;
}
