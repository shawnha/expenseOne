import { NextRequest } from "next/server";
import { handlePlanError, planJson, requirePlanActor, requireUuidParam } from "@/lib/plans/api";
import { getPlanPick } from "@/services/plan-picks.service";

// ---------------------------------------------------------------------------
// GET /api/plans/items/[id]/pick
//
// 계획 카드 「입금요청으로 만들기」(?plan=…)로 열린 폼이 불러올 값. 볼 수 없거나 진행 중이 아니면 { pick: null }.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const actor = await requirePlanActor();
    const id = requireUuidParam((await context.params).id, "계획");
    return planJson({ pick: await getPlanPick(actor, id) });
  } catch (err) {
    return handlePlanError(err);
  }
}
