import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { setInvoiceIssued } from "@/services/expense.service";
import { z } from "zod";

const bodySchema = z.object({ issued: z.boolean() });

// ---------------------------------------------------------------------------
// PATCH /api/expenses/[id]/invoice-issued
//
// 사입 건의 세금계산서 발행 완료/해제. ADMIN 전용.
// 해제를 열어두는 이유: 잘못 눌렀을 때 되돌릴 방법이 없으면, 실수로 발행 완료가
// 찍힌 건이 미발행 목록에서 사라져 **다시 놓치게 된다.**
// ---------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    await requireAdmin();

    const { id } = await params;
    validateUUID(id);

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "issued 값이 필요합니다." } },
        { status: 400 },
      );
    }

    const updated = await setInvoiceIssued(id, parsed.data.issued);

    revalidatePath("/admin/purchase-invoice");
    revalidatePath(`/expenses/${id}`);

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}
