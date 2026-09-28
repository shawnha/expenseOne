import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handleError, requireAuth, validateOrigin, validateUUID } from "@/lib/api-utils";
import { parseBody, toActor } from "@/lib/tax-invoice-api";
import { updateTaxInvoiceSchema } from "@/lib/validations/tax-invoice";
import { updateTaxInvoiceRequest } from "@/services/tax-invoice.service";

// PATCH /api/tax-invoices/[id] — 발행 대기 중인 요청 고치기(본인 또는 관리자).

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();
    const id = validateUUID((await ctx.params).id);
    const input = await parseBody(request, updateTaxInvoiceSchema);
    const row = await updateTaxInvoiceRequest(toActor(user), id, input);
    revalidatePath("/tax-invoices");
    return NextResponse.json({ data: { id: row.id } });
  } catch (err) {
    return handleError(err);
  }
}
