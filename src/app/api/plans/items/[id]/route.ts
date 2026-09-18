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
import { updatePlanSchema } from "@/lib/validations/plan";
import { getPlanDetail, updatePlan } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// GET   /api/plans/items/[id] -- 상세(필드·연결·메모·최근 이력 10)
// PATCH /api/plans/items/[id] -- 수정. body 의 version 이 현재 version 과 다르면 409
//
// 접근 권한이 없으면 **404** 다(존재 여부를 알려주지 않는다, SCHEMA.md 4절 (c)).
// GET 은 읽기만 한다 — 메모 읽음 표시는 POST …/read 가 따로 맡는다.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const actor = await requirePlanActor();
    const id = requireUuidParam((await context.params).id, "계획");
    return planJson(await getPlanDetail(actor, id));
  } catch (err) {
    return handlePlanError(err);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    // 스위치 게이트가 **먼저**다. 순서가 반대면 Origin 없는 요청에 403 이 나가, 스위치가 꺼진
    // 사용자도 "이 경로는 있다"는 사실을 알게 된다(없는 경로는 404). requirePlanActor 는 읽기만 한다.
    const actor = await requirePlanActor();
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const id = requireUuidParam((await context.params).id, "계획");
    const input = parseOrThrow(updatePlanSchema, await readJson(request));
    return planJson(await updatePlan(actor, id, input));
  } catch (err) {
    return handlePlanError(err);
  }
}
