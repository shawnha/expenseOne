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
import { planPaidSchema } from "@/lib/validations/plan";
import { setPlanPaid } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// POST /api/plans/items/[id]/paid -- "지급 완료" 표시 켜고 끄기 (참여자 누구나, 예정 계획만)
// 본문 { paid: boolean }. 표시라 version 을 올리지 않고 푸시도 보내지 않는다.
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
    const input = parseOrThrow(planPaidSchema, await readJson(request));
    return planJson(await setPlanPaid(actor, id, input.paid));
  } catch (err) {
    return handlePlanError(err);
  }
}
