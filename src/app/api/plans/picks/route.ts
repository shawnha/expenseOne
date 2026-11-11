import { handlePlanError, planJson, requirePlanActor } from "@/lib/plans/api";
import { listDepositPlanPicks } from "@/services/plan-picks.service";

// ---------------------------------------------------------------------------
// GET /api/plans/picks
//
// 입금요청 폼의 「내 비용계획에서 불러올까요?」 — 아직 이어진 비용이 없는, 날짜가 가까운 진행 중 계획.
// { mine: 내가 참여한 프로젝트 계획(담당자 상관없이), others: 대표가 참여하지 않은 프로젝트 계획 }. 비용계획이 꺼진 사람은 404(폼은 조용히 숨긴다).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requirePlanActor();
    return planJson(await listDepositPlanPicks(actor));
  } catch (err) {
    return handlePlanError(err);
  }
}
