import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handleError, requireAdmin, validateOrigin, validateUUID } from "@/lib/api-utils";
import { parseBody, toActor } from "@/lib/tax-invoice-api";
import { taxInvoiceIssuedSchema } from "@/lib/validations/tax-invoice";
import { setTaxInvoiceIssued } from "@/services/tax-invoice.service";

// POST /api/tax-invoices/[id]/issued { issued } — 관리자: 발행 완료 ↔ 발행 대기. 완료 시 요청자에게 알림.

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAdmin();
    const id = validateUUID((await ctx.params).id);
    const { issued } = await parseBody(request, taxInvoiceIssuedSchema);
    const row = await setTaxInvoiceIssued(toActor(user), id, issued);
    revalidatePath("/tax-invoices");
    return NextResponse.json({ data: { id: row.id, status: row.status } });
  } catch (err) {
    return handleError(err);
  }
}
