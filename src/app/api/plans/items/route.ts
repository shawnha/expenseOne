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
    // 스위치 게이트가 **먼저**다. 순서가 반대면 Origin 없는 요청에 403 이 나가, 스위치가 꺼진
    // 사용자도 "이 경로는 있다"는 사실을 알게 된다(없는 경로는 404). requirePlanActor 는 읽기만 한다.
    const actor = await requirePlanActor();
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const input = parseOrThrow(createPlanSchema, await readJson(request));
    return planJson(await createPlan(actor, input), 201);
  } catch (err) {
    return handlePlanError(err);
  }
}
