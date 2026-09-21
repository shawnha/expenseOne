import { handlePlanError, planJson, requirePlanActor } from "@/lib/plans/api";
import { listPlanUsers } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// GET /api/plans/users -- 참여자 추가용 활성 직원 목록 (id + 이름만, SCHEMA.md 5절 9)
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requirePlanActor();
    return planJson({ users: await listPlanUsers(actor) });
  } catch (err) {
    return handlePlanError(err);
  }
}
