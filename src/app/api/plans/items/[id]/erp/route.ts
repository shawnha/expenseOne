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
import { planErpSchema } from "@/lib/validations/plan";
import { setPlanErpApplied } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// POST /api/plans/items/[id]/erp -- "ERP 반영함" 표시 켜고 끄기 (대표만, 예정 계획만)
// 본문 { applied: boolean }. 장부 표시라 version 을 올리지 않고 푸시도 보내지 않는다.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // 스위치 게이트가 먼저다(cancel/route.ts 와 같은 이유 — 꺼진 사용자에게 경로의 존재를 알리지 않는다).
    const actor = await requirePlanActor();
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const id = requireUuidParam((await context.params).id, "계획");
    const input = parseOrThrow(planErpSchema, await readJson(request));
    return planJson(await setPlanErpApplied(actor, id, input.applied));
  } catch (err) {
    return handlePlanError(err);
  }
}
