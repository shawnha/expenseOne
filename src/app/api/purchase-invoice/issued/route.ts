import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { setInvoiceIssued } from "@/services/expense.service";
import { z } from "zod";

const bodySchema = z.object({
  /** 발행 처리할 줄들. 계산서 한 장으로 여러 약국을 처리했으면 한 번에 보낸다. */
  lineIds: z.array(z.string().uuid()).min(1, "대상을 선택해주세요"),
  issued: z.boolean(),
});

// ---------------------------------------------------------------------------
// PATCH /api/purchase-invoice/issued
//
// 사입 줄(약국별)의 세금계산서 발행 완료/해제. ADMIN 전용.
// 해제를 열어두는 이유: 잘못 눌렀을 때 되돌릴 방법이 없으면, 실수로 발행 완료가
// 찍힌 줄이 미발행 목록에서 사라져 **다시 놓치게 된다.**
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    await requireAdmin();

    const parsed = bodySchema.safeParse(await request.json());
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

    for (const id of parsed.data.lineIds) validateUUID(id);

    const updated = await setInvoiceIssued(parsed.data.lineIds, parsed.data.issued);

    revalidatePath("/admin/purchase-invoice");

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}
