import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth, errorResponse, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { setCardSubscriptionActive } from "@/services/card-subscription.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// PATCH /api/card-subscriptions/[id]  { active: boolean } — 정기 결제 해지 표시 / 다시 켜기(0031)
// 주인 또는 관리자만(setCardSubscriptionActive).
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();
    const id = validateUUID((await context.params).id);
    const body = await request.json().catch(() => null);
    if (typeof body?.active !== "boolean") {
      return errorResponse("VALIDATION_ERROR", "active 값이 필요합니다.");
    }
    await setCardSubscriptionActive({ id: user.id, role: user.role }, id, body.active);
    revalidatePath("/expenses/recurring");
    return NextResponse.json({ data: { id, active: body.active } });
  } catch (err) {
    return handleError(err);
  }
}
