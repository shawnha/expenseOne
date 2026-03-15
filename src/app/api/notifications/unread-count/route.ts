import { NextResponse } from "next/server";
import { requireAuth, handleError } from "@/lib/api-utils";
import { getUnreadCount } from "@/services/notification.service";

// ---------------------------------------------------------------------------
// GET /api/notifications/unread-count
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const user = await requireAuth();

    const count = await getUnreadCount(user.id);

    return NextResponse.json({ data: { count } });
  } catch (err) {
    return handleError(err);
  }
}
