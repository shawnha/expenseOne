import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleError } from "@/lib/api-utils";
import { deleteAttachment } from "@/services/attachment.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// DELETE /api/attachments/[id] -- delete an attachment (owner only)
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;

    const deleted = await deleteAttachment(id, user.id);

    return NextResponse.json({ data: deleted });
  } catch (err) {
    return handleError(err);
  }
}
