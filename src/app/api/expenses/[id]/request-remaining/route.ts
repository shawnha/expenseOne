import { NextRequest, NextResponse } from "next/server";
import { requireAuth, errorResponse, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { expenses, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { createNotification } from "@/services/notification.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST /api/expenses/[id]/request-remaining -- request remaining payment
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireAuth();
    const id = validateUUID((await context.params).id);

    // Fetch the expense
    const [expense] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, id));

    if (!expense) {
      return errorResponse("NOT_FOUND", "비용을 찾을 수 없습니다.");
    }

    // Only the submitter can request remaining payment
    if (expense.submittedById !== user.id) {
      return errorResponse("FORBIDDEN", "본인의 비용만 후지급 요청할 수 있습니다.");
    }

    // Must be APPROVED
    if (expense.status !== "APPROVED") {
      return errorResponse("VALIDATION_ERROR", "승인된 비용만 후지급 요청할 수 있습니다.");
    }

    // Must be a prepaid expense with partial percentage
    if (!expense.isPrePaid) {
      return errorResponse("VALIDATION_ERROR", "선지급 비용만 후지급 요청할 수 있습니다.");
    }

    if (expense.prePaidPercentage == null || expense.prePaidPercentage >= 100) {
      return errorResponse("VALIDATION_ERROR", "부분 선지급 비용만 후지급 요청할 수 있습니다.");
    }

    // Must not already be requested
    if (expense.remainingPaymentRequested) {
      return errorResponse("VALIDATION_ERROR", "이미 후지급 요청이 되었습니다.");
    }

    // Update the expense with state conditions in WHERE to prevent TOCTOU race
    const [updated] = await db
      .update(expenses)
      .set({ remainingPaymentRequested: true, updatedAt: new Date() })
      .where(
        and(
          eq(expenses.id, id),
          eq(expenses.status, "APPROVED"),
          eq(expenses.remainingPaymentRequested, false),
        ),
      )
      .returning();

    if (!updated) {
      return errorResponse("VALIDATION_ERROR", "비용 상태가 변경되었습니다. 페이지를 새로고침해주세요.");
    }

    // Notify all ADMINs
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true)));

    const remainingAmount = expense.amount - Math.round(expense.amount * expense.prePaidPercentage / 100);

    await Promise.all(admins.map((admin) =>
      createNotification({
        recipientId: admin.id,
        type: "REMAINING_PAYMENT_REQUEST",
        title: "후지급 요청이 등록되었습니다",
        message: `${user.name}님이 "${expense.title}" 건의 후지급(${remainingAmount.toLocaleString()}원)을 요청했습니다.`,
        relatedExpenseId: expense.id,
      })
    ));

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}
