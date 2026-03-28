import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin, errorResponse, handleError, validateOrigin } from "@/lib/api-utils";
import { sendPushToUser } from "@/services/push.service";

// ---------------------------------------------------------------------------
// POST /api/push/test -- send a test push notification to the current user
// ADMIN only
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireAuth();
    await requireAdmin();

    await sendPushToUser(
      user.id,
      "테스트 알림 🔔",
      "Push 알림이 정상 작동합니다!",
      "/dashboard",
    );

    return NextResponse.json({ ok: true, message: "테스트 push 전송 완료" });
  } catch (err) {
    return handleError(err);
  }
}
