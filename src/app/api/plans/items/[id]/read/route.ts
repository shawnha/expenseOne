import { NextRequest } from "next/server";
import { validateOrigin } from "@/lib/api-utils";
import { handlePlanError, planJson, requirePlanActor, requireUuidParam } from "@/lib/plans/api";
import { markCommentsRead } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// POST /api/plans/items/[id]/read -- 메모 스레드를 열 때 읽음 위치를 지금으로 올린다.
// 상세 GET 은 읽기 전용이라 이 쓰기를 같이 하지 않는다(SCHEMA.md 4절 (c') 에서 분리).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const actor = await requirePlanActor();
    const id = requireUuidParam((await context.params).id, "계획");
    return planJson(await markCommentsRead(actor, id));
  } catch (err) {
    return handlePlanError(err);
  }
}
