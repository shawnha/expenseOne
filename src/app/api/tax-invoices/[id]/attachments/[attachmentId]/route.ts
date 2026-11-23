import { NextResponse } from "next/server";
import { handleError, requireAuth, validateUUID } from "@/lib/api-utils";
import { toActor } from "@/lib/tax-invoice-api";
import { downloadTaxInvoiceAttachment } from "@/services/tax-invoice-attachments.service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  try {
    const user = await requireAuth();
    const { id, attachmentId } = await params;
    const url = await downloadTaxInvoiceAttachment(toActor(user), validateUUID(id), validateUUID(attachmentId));
    return NextResponse.redirect(url, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleError(error);
  }
}
