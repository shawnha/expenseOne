import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleError } from "@/lib/api-utils";
import { getNotifications } from "@/services/notification.service";

// ---------------------------------------------------------------------------
// GET /api/notifications -- list notifications for the current user
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = request.nextUrl;

    const page = parseInt(searchParams.get("page") ?? "1", 10) || 1;
    const limit = parseInt(searchParams.get("limit") ?? "20", 10) || 20;

    const result = await getNotifications(user.id, page, Math.min(limit, 100));

    return NextResponse.json(result);
  } catch (err) {
    return handleError(err);
  }
}
