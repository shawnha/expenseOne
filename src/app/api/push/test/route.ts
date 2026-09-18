import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin, handleError, validateOrigin } from "@/lib/api-utils";
import { isPushConfigured, sendPushToUser } from "@/services/push.service";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// POST /api/push/test -- send a test push notification to the current user
// ADMIN only — includes debug info
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireAuth();
    await requireAdmin();

    // Check subscriptions for this user
    const subs = await db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        createdAt: pushSubscriptions.createdAt,
      })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, user.id));

    // 키가 "있다"와 "쓸 수 있다"는 다르다. 형식이 틀리면(setVapidDetails 실패)
    // 전송은 조용히 건너뛰므로, 여기서 그 차이를 그대로 보여준다.
    const vapidKeySet = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
    const vapidConfigured = isPushConfigured();

    if (subs.length === 0) {
      return NextResponse.json({
        ok: false,
        message: "Push 구독이 없습니다. 알림을 허용해주세요.",
        debug: {
          userId: user.id,
          subscriptionCount: 0,
          vapidKeySet,
          vapidConfigured,
        },
      });
    }

    if (!vapidConfigured) {
      return NextResponse.json({
        ok: false,
        message: vapidKeySet
          ? "VAPID 키 형식이 올바르지 않아 푸시 전송이 꺼져 있습니다. 서버 로그의 '[Push] VAPID 설정 실패'를 확인하세요."
          : "VAPID 키가 없어 푸시 전송이 꺼져 있습니다.",
        debug: {
          userId: user.id,
          subscriptionCount: subs.length,
          vapidKeySet,
          vapidConfigured,
        },
      });
    }

    await sendPushToUser(
      user.id,
      "테스트 알림 🔔",
      "Push 알림이 정상 작동합니다!",
      "/dashboard",
    );

    return NextResponse.json({
      ok: true,
      message: `테스트 push 전송 완료 (${subs.length}개 구독)`,
      debug: {
        userId: user.id,
        subscriptionCount: subs.length,
        endpoints: subs.map((s) => s.endpoint.substring(0, 60) + "..."),
        vapidKeySet,
        vapidConfigured,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
