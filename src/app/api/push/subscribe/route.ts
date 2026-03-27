import { NextRequest, NextResponse } from "next/server";
import { requireAuth, errorResponse, handleError, validateOrigin } from "@/lib/api-utils";
import { saveSubscription, removeSubscription } from "@/services/push.service";

// ---------------------------------------------------------------------------
// POST /api/push/subscribe -- save push subscription
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireAuth();
    const body = await request.json();

    const { endpoint, keys } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return errorResponse(
        "VALIDATION_ERROR",
        "endpoint, keys.p256dh, keys.auth가 필요합니다.",
      );
    }

    const id = await saveSubscription(user.id, endpoint, keys.p256dh, keys.auth);

    return NextResponse.json({ data: { id } }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/push/subscribe -- remove push subscription
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireAuth();

    let endpoint: string | undefined;
    try {
      const body = await request.json();
      endpoint = body.endpoint;
    } catch {
      // No body = remove all subscriptions
    }

    await removeSubscription(user.id, endpoint);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
