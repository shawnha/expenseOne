import { NextRequest, NextResponse } from "next/server";
import { handleError, requireAuth, validateOrigin, validateUUID } from "@/lib/api-utils";
import { deleteRecurringAttachment } from "@/services/recurring-expense.service";

// DELETE — 반복 첨부 지우기. 이미 만든 입금요청의 첨부는 사본이라 그대로다.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();
    const { id, attachmentId } = await params;
    validateUUID(id);
    validateUUID(attachmentId);
    await deleteRecurringAttachment(id, attachmentId, { id: user.id, role: user.role });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
