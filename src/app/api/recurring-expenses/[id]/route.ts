import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { errorResponse, handleError, requireAuth, validateOrigin, validateUUID } from "@/lib/api-utils";
import { recurringExpenseUpdateSchema } from "@/lib/validations/expense";
import {
  updateRecurringExpense,
  deleteRecurringExpense,
} from "@/services/recurring-expense.service";

// PATCH — 수정 (일시중지 토글 포함). 보낸 칸만 바꾼다.
// 예전엔 refine 이 걸린 스키마에 .partial() 을 불러 zod v4 가 매번 예외를 던졌다(일시중지가 500).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();
    const { id } = await params;
    validateUUID(id);

    const parsed = recurringExpenseUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "));
    }

    const updated = await updateRecurringExpense(id, parsed.data, { id: user.id, role: user.role });
    revalidatePath("/expenses/recurring");
    if (updated.planSync) revalidatePath("/plans");
    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}

// DELETE — 반복 삭제. 이미 만든 입금요청과 사람이 손댄 계획은 남는다.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();
    const { id } = await params;
    validateUUID(id);

    await deleteRecurringExpense(id, { id: user.id, role: user.role });
    revalidatePath("/expenses/recurring");
    revalidatePath("/plans");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
