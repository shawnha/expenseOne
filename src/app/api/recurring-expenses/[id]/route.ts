import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { recurringExpenseSchema } from "@/lib/validations/expense";
import {
  updateRecurringExpense,
  deleteRecurringExpense,
} from "@/services/recurring-expense.service";

async function requireUser() {
  const user = await getCachedCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

// PATCH — 수정 (일시중지 토글 포함)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireUser();
    const { id } = await params;
    validateUUID(id);

    // 일시중지 토글처럼 일부 필드만 보내는 경우가 있어 partial로 받는다.
    const parsed = recurringExpenseSchema.partial().safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues.map((i) => i.message).join(", "),
          },
        },
        { status: 400 },
      );
    }

    const updated = await updateRecurringExpense(
      id,
      parsed.data,
      user.id,
      user.role === "ADMIN",
    );
    revalidatePath("/expenses/recurring");
    return NextResponse.json({ data: updated });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다" } },
        { status: 401 },
      );
    }
    return handleError(err);
  }
}

// DELETE — 반복 설정 삭제. 이미 생성된 입금요청은 남는다.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireUser();
    const { id } = await params;
    validateUUID(id);

    await deleteRecurringExpense(id, user.id, user.role === "ADMIN");
    revalidatePath("/expenses/recurring");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다" } },
        { status: 401 },
      );
    }
    return handleError(err);
  }
}
