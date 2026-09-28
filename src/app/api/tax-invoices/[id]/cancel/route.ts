import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handleError, requireAuth, validateOrigin, validateUUID } from "@/lib/api-utils";
import { parseBody, toActor } from "@/lib/tax-invoice-api";
import { taxInvoiceCancelSchema } from "@/lib/validations/tax-invoice";
import { cancelTaxInvoiceRequest } from "@/services/tax-invoice.service";

// POST /api/tax-invoices/[id]/cancel { reason? } — 발행 대기 중인 요청 취소(본인 또는 관리자).

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();
    const id = validateUUID((await ctx.params).id);
    const { reason } = await parseBody(request, taxInvoiceCancelSchema);
    const row = await cancelTaxInvoiceRequest(toActor(user), id, reason);
    revalidatePath("/tax-invoices");
    return NextResponse.json({ data: { id: row.id, status: row.status } });
  } catch (err) {
    return handleError(err);
  }
}
