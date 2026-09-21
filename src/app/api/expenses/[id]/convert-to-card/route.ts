import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth, errorResponse, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { convertToCardSchema } from "@/lib/validations/expense";
import { ConvertError, CONVERT_ERROR_STATUS } from "@/lib/expense-convert";
import { convertDepositRequestToCard } from "@/services/expense-convert.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST /api/expenses/[id]/convert-to-card -- 입금요청 → 법카 사용으로 변경
//   제출자 본인 또는 ADMIN, SUBMITTED 상태만. 자격이 안 되면 409(권한은 403).
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireAuth();
    const id = validateUUID((await context.params).id);
    const body = await request.json().catch(() => ({}));

    const parsed = convertToCardSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const updated = await convertDepositRequestToCard(
      id,
      { id: user.id, role: user.role },
      parsed.data,
    );

    revalidatePath("/");
    revalidatePath("/expenses");
    revalidatePath(`/expenses/${id}`);
    revalidatePath("/admin/pending");

    return NextResponse.json({ data: updated });
  } catch (err) {
    // 기존 AppError에는 CONFLICT(409)가 없어서 변경 전용 오류는 여기서 상태 코드로 바꾼다.
    if (err instanceof ConvertError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: CONVERT_ERROR_STATUS[err.code] },
      );
    }
    return handleError(err);
  }
}
