import { NextRequest, NextResponse } from "next/server";
import { prePaidSplit } from "@/lib/utils/pre-paid";
import { getPrePaidFixedAmount } from "@/services/expense.service";
import { revalidatePath } from "next/cache";
import { requireAdmin, errorResponse, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { expenses, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createNotification } from "@/services/notification.service";
import { sendPushToUser } from "@/services/push.service";
import { notifySlackRemainingPaymentApproved } from "@/services/slack.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST /api/expenses/[id]/approve-remaining -- approve remaining payment (ADMIN only)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    await requireAdmin();
    const id = validateUUID((await context.params).id);

    // Fetch the expense
    const [expense] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, id));

    if (!expense) {
      return errorResponse("NOT_FOUND", "비용을 찾을 수 없습니다.");
    }

    // Must be a DEPOSIT_REQUEST
    if (expense.type !== "DEPOSIT_REQUEST") {
      return errorResponse("VALIDATION_ERROR", "입금요청만 후지급 승인할 수 있습니다.");
    }

    // Must be APPROVED
    if (expense.status !== "APPROVED") {
      return errorResponse("VALIDATION_ERROR", "승인된 비용만 후지급 승인할 수 있습니다.");
    }

    // Must be a prepaid expense
    if (!expense.isPrePaid) {
      return errorResponse("VALIDATION_ERROR", "선지급 비용만 후지급 승인할 수 있습니다.");
    }

    // Must have remaining payment requested
    if (!expense.remainingPaymentRequested) {
      return errorResponse("VALIDATION_ERROR", "후지급 요청이 되지 않은 비용입니다.");
    }

    // Must not already be approved
    if (expense.remainingPaymentApproved) {
      return errorResponse("VALIDATION_ERROR", "이미 후지급이 승인되었습니다.");
    }

    // Update the expense with state conditions in WHERE to prevent TOCTOU race
    const [updated] = await db
      .update(expenses)
      .set({ remainingPaymentApproved: true, updatedAt: new Date() })
      .where(
        and(
          eq(expenses.id, id),
          eq(expenses.status, "APPROVED"),
          eq(expenses.remainingPaymentRequested, true),
          eq(expenses.remainingPaymentApproved, false),
        ),
      )
      .returning();

    if (!updated) {
      return errorResponse("VALIDATION_ERROR", "비용 상태가 변경되었습니다. 페이지를 새로고침해주세요.");
    }

    // 잔금 — 계산은 lib/utils/pre-paid 한 곳에서. 금액으로 정한 선지급이면 그 금액 그대로 뺀다.
    // (후지급 요청 라우트가 부분 선지급만 받으므로 split 은 늘 있다.)
    const prePaidFixedAmount = await getPrePaidFixedAmount(expense.id);
    const remainingAmount = prePaidSplit({ ...expense, prePaidFixedAmount })?.remainingAmount ?? 0;

    // Notify the submitter
    await createNotification({
      recipientId: expense.submittedById,
      type: "REMAINING_PAYMENT_APPROVED",
      title: "후지급이 승인되었습니다",
      message: `"${expense.title}" 건의 후지급(${remainingAmount.toLocaleString()}원)이 승인되었습니다.`,
      relatedExpenseId: expense.id,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Slack + Web Push. Vercel serverless가 백그라운드 작업을 끊지 않도록 await하되,
    // 알림 실패가 승인 처리를 되돌리지 않도록 allSettled로 격리한다.
    const [submitter] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, expense.submittedById));

    await Promise.allSettled([
      sendPushToUser(
        expense.submittedById,
        "후지급 승인",
        `"${expense.title}" 건의 후지급(${remainingAmount.toLocaleString()}원)이 승인되었습니다.`,
        `${appUrl}/expenses/${expense.id}`,
      ).catch((err) => console.error("[Push] 후지급 승인 알림 실패:", err)),
      submitter
        ? notifySlackRemainingPaymentApproved({
            submitterEmail: submitter.email,
            submitterName: submitter.name,
            title: expense.title,
            amount: expense.amount,
            prePaidPercentage: expense.prePaidPercentage ?? 0,
            prePaidFixedAmount,
            expenseUrl: `${appUrl}/expenses/${expense.id}`,
            companyId: expense.companyId,
            currency: expense.currency,
            amountOriginal: expense.amountOriginal,
            accountHolder: expense.accountHolder,
            dueDate: expense.dueDate,
          }).catch((err) => console.error("[Slack] 후지급 승인 알림 실패:", err))
        : Promise.resolve(null),
    ]);

    revalidatePath("/");
    revalidatePath("/expenses");
    revalidatePath("/admin/pending");
    revalidatePath("/admin/expenses");

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}
