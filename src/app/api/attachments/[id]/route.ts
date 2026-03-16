import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { deleteAttachment } from "@/services/attachment.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// DELETE /api/attachments/[id] -- delete an attachment (owner only)
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireAuth();
    const id = validateUUID((await context.params).id);

    const deleted = await deleteAttachment(id, user.id);

    return NextResponse.json({ data: deleted });
  } catch (err) {
    return handleError(err);
  }
}
