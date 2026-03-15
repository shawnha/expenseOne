import { NextRequest, NextResponse } from "next/server";
import { requireAuth, errorResponse, handleError } from "@/lib/api-utils";
import { markAsRead } from "@/services/notification.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// PATCH /api/notifications/[id]/read -- mark single notification as read
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;

    const updated = await markAsRead(id, user.id);
    if (!updated) {
      return errorResponse("NOT_FOUND", "알림을 찾을 수 없습니다.");
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}
