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
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const actor = await requirePlanActor();
    const id = requireUuidParam((await context.params).id, "계획");
    const input = parseOrThrow(cancelPlanSchema, await readJson(request));
    return planJson(await cancelPlan(actor, id, input));
  } catch (err) {
    return handlePlanError(err);
  }
}
