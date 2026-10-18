import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { errorResponse, handleError, requireAuth, validateOrigin } from "@/lib/api-utils";
import { recurringExpenseSchema } from "@/lib/validations/expense";
import {
  listRecurringExpenses,
  createRecurringExpense,
} from "@/services/recurring-expense.service";

// GET — 반복 지급 목록 (관리자는 전체, 그 외 본인 것)
export async function GET() {
  try {
    const user = await requireAuth();
    const data = await listRecurringExpenses(user.id, user.role === "ADMIN");
    return NextResponse.json({ data });
  } catch (err) {
    return handleError(err);
  }
}

// POST — 반복 지급 등록(반복 화면·입금요청 폼의 「매달 반복」·비용계획 만들기의 「매달 반복」)
export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();

    const parsed = recurringExpenseSchema.safeParse(await request.json());
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "));
    }

    const created = await createRecurringExpense(parsed.data, { id: user.id, role: user.role });
    revalidatePath("/expenses/recurring");
    if (created.planProjectId) revalidatePath("/plans");
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
