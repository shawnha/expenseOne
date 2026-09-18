import { NextRequest } from "next/server";
import { validateOrigin } from "@/lib/api-utils";
import { handlePlanError, planJson, requirePlanActor, requireUuidParam } from "@/lib/plans/api";
import { markCommentsRead } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// POST /api/plans/items/[id]/read -- 메모 스레드를 열 때 읽음 위치를 지금으로 올린다.
// 상세 GET 은 읽기 전용이라 이 쓰기를 같이 하지 않는다(SCHEMA.md 4절 (c') 에서 분리).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // 스위치 게이트가 **먼저**다. 순서가 반대면 Origin 없는 요청에 403 이 나가, 스위치가 꺼진
    // 사용자도 "이 경로는 있다"는 사실을 알게 된다(없는 경로는 404). requirePlanActor 는 읽기만 한다.
    const actor = await requirePlanActor();
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const id = requireUuidParam((await context.params).id, "계획");
    return planJson(await markCommentsRead(actor, id));
  } catch (err) {
    return handlePlanError(err);
  }
}
