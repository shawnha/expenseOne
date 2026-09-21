import { NextRequest } from "next/server";
import { handlePlanError, planJson, requirePlanActor, requireUuidParam } from "@/lib/plans/api";
import { listLinkSuggestions } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// GET /api/plans/items/[id]/link-suggestions
//
// 자동 연결 **제안** 최대 5건 — 같은 법인의 연결되지 않은 KRW 입금요청 중 날짜(±45일)나 금액(0.8~1.25배)이
// 맞는 것을 점수순으로. 잇는 것은 사람이 POST …/links 를 눌러야 한다(잘못 이으면 스냅샷이 얼어붙는다).
// 범위는 link-candidates 와 같다(MEMBER 는 본인 제출분만). 접근 권한이 없으면 404.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const actor = await requirePlanActor();
    const id = requireUuidParam((await context.params).id, "계획");
    return planJson({ suggestions: await listLinkSuggestions(actor, id) });
  } catch (err) {
    return handlePlanError(err);
  }
}
