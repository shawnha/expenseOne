import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { expensePurposeSchema } from "@/lib/admin/expense-purpose";
import { errorResponse, handleError, requireAdmin, validateOrigin, validateUUID } from "@/lib/api-utils";
import { setExpensePurpose } from "@/services/expense-purpose.service";

const bodySchema = z.strictObject({ purpose: expensePurposeSchema.nullable() });

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const forbidden = validateOrigin(request);
  if (forbidden) return forbidden;
  try {
    const admin = await requireAdmin();
    const id = validateUUID((await context.params).id);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse("VALIDATION_ERROR", "비용 성격을 다시 선택해주세요.");
    const { purpose } = parsed.data;
    if (!await setExpensePurpose(id, purpose, admin.id)) {
      return errorResponse("NOT_FOUND", "비용을 찾을 수 없거나 원거래에서 분류해야 하는 반품입니다.");
    }
    revalidatePath(`/expenses/${id}`);
    revalidatePath("/admin");
    revalidatePath("/admin/expenses");
    return NextResponse.json({ data: { purpose } });
  } catch (error) {
    return handleError(error);
  }
}
