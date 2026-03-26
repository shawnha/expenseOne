import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, handleError, jsonWithCache } from "@/lib/api-utils";
import { getNotifications } from "@/services/notification.service";

const notificationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

// ---------------------------------------------------------------------------
// GET /api/notifications -- list notifications for the current user
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = request.nextUrl;

    const { page, limit } = notificationQuerySchema.parse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    const result = await getNotifications(user.id, page, limit);

    return jsonWithCache(result, 0, 10);
  } catch (err) {
    return handleError(err);
  }
}
