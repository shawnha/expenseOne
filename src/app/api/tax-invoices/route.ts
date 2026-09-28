import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { handleError, requireAuth, validateOrigin } from "@/lib/api-utils";
import { parseBody, toActor } from "@/lib/tax-invoice-api";
import { createTaxInvoiceSchema } from "@/lib/validations/tax-invoice";
import { createTaxInvoiceRequest, listTaxInvoiceRequests } from "@/services/tax-invoice.service";

// GET  /api/tax-invoices — 관리자는 전부, 나머지는 본인 요청만
// POST /api/tax-invoices — 세금계산서 발행 요청(누구나). 관리자에게 알림.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    return NextResponse.json({ data: await listTaxInvoiceRequests(toActor(user)) });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();
    const input = await parseBody(request, createTaxInvoiceSchema);
    const row = await createTaxInvoiceRequest(toActor(user), input);
    revalidatePath("/tax-invoices");
    return NextResponse.json({ data: { id: row.id } }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
