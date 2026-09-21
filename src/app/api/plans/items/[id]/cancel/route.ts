import { NextRequest } from "next/server";
import { validateOrigin } from "@/lib/api-utils";
import {
  handlePlanError,
  parseOrThrow,
  planJson,
  readJson,
  requirePlanActor,
  requireUuidParam,
} from "@/lib/plans/api";
import { cancelPlanSchema } from "@/lib/validations/plan";
import { cancelPlan } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// POST /api/plans/items/[id]/cancel -- 계획 취소 (status=CANCELLED)
// 하드 삭제는 없다. 사유는 이력(plan_change_log.reason)에만 남는다.
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
    const input = parseOrThrow(cancelPlanSchema, await readJson(request));
    return planJson(await cancelPlan(actor, id, input));
  } catch (err) {
    return handlePlanError(err);
  }
}
