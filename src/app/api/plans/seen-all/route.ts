import { NextRequest } from "next/server";
import { validateOrigin } from "@/lib/api-utils";
import { handlePlanError, planJson, requirePlanActor } from "@/lib/plans/api";
import { markAllPlansSeen } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// POST /api/plans/seen-all -- 보드의 「모두 확인함」(0027). 지금까지의 변경 표시를 모두 지운다.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePlanActor();
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    return planJson(await markAllPlansSeen(actor));
  } catch (err) {
    return handlePlanError(err);
  }
}
