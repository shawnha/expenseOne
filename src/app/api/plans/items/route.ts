import { NextRequest } from "next/server";
import { validateOrigin } from "@/lib/api-utils";
import { handlePlanError, parseOrThrow, planJson, readJson, requirePlanActor } from "@/lib/plans/api";
import { boardQuerySchema, createPlanSchema, searchParamsToObject } from "@/lib/validations/plan";
import { createPlan, listPlanItems } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// GET  /api/plans/items -- 보드와 같은 필터의 평평한 목록
// POST /api/plans/items -- 계획 추가
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await requirePlanActor();
    const query = parseOrThrow(boardQuerySchema, searchParamsToObject(request.nextUrl.searchParams));
    return planJson(await listPlanItems(actor, query));
  } catch (err) {
    return handlePlanError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const actor = await requirePlanActor();
    const input = parseOrThrow(createPlanSchema, await readJson(request));
    return planJson(await createPlan(actor, input), 201);
  } catch (err) {
    return handlePlanError(err);
  }
}
