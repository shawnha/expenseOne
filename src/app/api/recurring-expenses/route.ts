import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { handleError, validateOrigin } from "@/lib/api-utils";
import { recurringExpenseSchema } from "@/lib/validations/expense";
import {
  listRecurringExpenses,
  createRecurringExpense,
} from "@/services/recurring-expense.service";

// GET — 반복 설정 목록 (관리자는 전체, 그 외 본인 것)
export async function GET() {
  try {
    const user = await getCachedCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다" } },
        { status: 401 },
      );
    }
    const data = await listRecurringExpenses(user.id, user.role === "ADMIN");
    return NextResponse.json({ data });
  } catch (err) {
    return handleError(err);
  }
}

// POST — 반복 설정 등록
export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await getCachedCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다" } },
        { status: 401 },
      );
    }

    const parsed = recurringExpenseSchema.safeParse(await request.json());
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

    const created = await createRecurringExpense(parsed.data, user.id);
    revalidatePath("/expenses/recurring");
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
