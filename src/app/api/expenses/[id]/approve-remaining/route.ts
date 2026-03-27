import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin, errorResponse, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createNotification } from "@/services/notification.service";
import { sendPushToUser } from "@/services/push.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST /api/expenses/[id]/approve-remaining -- approve remaining payment (ADMIN only)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const admin = await requireAdmin();
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

    // Calculate remaining amount
    const remainingAmount =
      expense.amount -
      Math.round(
        (expense.amount * (expense.prePaidPercentage ?? 0)) / 100,
      );

    // Notify the submitter
    await createNotification({
      recipientId: expense.submittedById,
      type: "REMAINING_PAYMENT_APPROVED",
      title: "후지급이 승인되었습니다",
      message: `"${expense.title}" 건의 후지급(${remainingAmount.toLocaleString()}원)이 승인되었습니다.`,
      relatedExpenseId: expense.id,
    });

    // Fire-and-forget Web Push notification
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    sendPushToUser(
      expense.submittedById,
      "후지급 승인",
      `"${expense.title}" 건의 후지급(${remainingAmount.toLocaleString()}원)이 승인되었습니다.`,
      `${appUrl}/expenses/${expense.id}`,
    ).catch((err) => console.error("[Push] 후지급 승인 알림 실패:", err));

    revalidatePath("/");
    revalidatePath("/expenses");
    revalidatePath("/admin/pending");

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}
