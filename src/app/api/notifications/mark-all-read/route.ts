import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleError, validateOrigin } from "@/lib/api-utils";
import { markAllAsRead } from "@/services/notification.service";

// ---------------------------------------------------------------------------
// PATCH /api/notifications/mark-all-read -- mark all notifications as read
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireAuth();

    await markAllAsRead(user.id);

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    return handleError(err);
  }
}
