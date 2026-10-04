import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { deleteAttachment } from "@/services/attachment.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// DELETE /api/attachments/[id] -- delete an attachment (올린 사람 또는 관리자, lib/expense-edit-access.ts)
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireAuth();
    const id = validateUUID((await context.params).id);

    const deleted = await deleteAttachment(id, { id: user.id, role: user.role });

    return NextResponse.json({ data: deleted });
  } catch (err) {
    return handleError(err);
  }
}
