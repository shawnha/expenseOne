import { NextRequest, NextResponse } from "next/server";
import { requireAuth, errorResponse, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { markAsRead } from "@/services/notification.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// PATCH /api/notifications/[id]/read -- mark single notification as read
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireAuth();
    const id = validateUUID((await context.params).id);

    const updated = await markAsRead(id, user.id);
    if (!updated) {
      return errorResponse("NOT_FOUND", "알림을 찾을 수 없습니다.");
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}
