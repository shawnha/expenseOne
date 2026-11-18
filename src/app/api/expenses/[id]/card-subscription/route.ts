import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { markCardSubscription, unmarkCardSubscription } from "@/services/card-subscription.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST   /api/expenses/[id]/card-subscription — 이 법카를 정기 결제로 표시(0031)
// DELETE /api/expenses/[id]/card-subscription — 표시 해제
// 규칙(법카만·작성자 또는 관리자·가맹점 필요)은 card-subscription.service 한 곳.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();
    const id = validateUUID((await context.params).id);
    const result = await markCardSubscription({ id: user.id, role: user.role }, id);
    revalidatePath(`/expenses/${id}`);
    revalidatePath("/expenses/recurring");
    return NextResponse.json({ data: result });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();
    const id = validateUUID((await context.params).id);
    await unmarkCardSubscription({ id: user.id, role: user.role }, id);
    revalidatePath(`/expenses/${id}`);
    revalidatePath("/expenses/recurring");
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleError(err);
  }
}
