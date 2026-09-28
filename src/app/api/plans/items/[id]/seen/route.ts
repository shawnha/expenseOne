import { NextRequest } from "next/server";
import { validateOrigin } from "@/lib/api-utils";
import { handlePlanError, planJson, requirePlanActor, requireUuidParam } from "@/lib/plans/api";
import { markPlanSeen } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// POST /api/plans/items/[id]/seen -- 상세를 열었다 = 그 계획의 변경을 봤다(0027).
// 상세 GET 은 읽기 전용이라 이 쓰기를 같이 하지 않는다(메모 읽음 …/read 와 같은 이유). 화면이 변경 내용을
// 그린 **뒤에** 부른다 — 먼저 부르면 무엇이 바뀌었는지 보여 주기도 전에 표시가 사라진다.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // 스위치 게이트가 먼저다(…/read 와 같은 이유 — 꺼진 사용자에게 경로의 존재를 알리지 않는다).
    const actor = await requirePlanActor();
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const id = requireUuidParam((await context.params).id, "계획");
    return planJson(await markPlanSeen(actor, id));
  } catch (err) {
    return handlePlanError(err);
  }
}
