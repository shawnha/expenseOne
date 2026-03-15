import { NextResponse } from "next/server";
import { requireAuth, handleError } from "@/lib/api-utils";
import { markAllAsRead } from "@/services/notification.service";

// ---------------------------------------------------------------------------
// PATCH /api/notifications/mark-all-read -- mark all notifications as read
// ---------------------------------------------------------------------------
export async function PATCH() {
  try {
    const user = await requireAuth();

    await markAllAsRead(user.id);

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    return handleError(err);
  }
}
