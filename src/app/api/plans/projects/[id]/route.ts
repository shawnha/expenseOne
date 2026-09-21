import { NextRequest } from "next/server";
import { validateOrigin } from "@/lib/api-utils";
import { handlePlanError, planJson, requirePlanActor, requireUuidParam } from "@/lib/plans/api";
import { deleteProject } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// DELETE /api/plans/projects/[id]  — 프로젝트 소프트 삭제
//
// 만든 사람이나 대표만(403). 계획 행은 남지만 프로젝트가 지워지면 어디에도 보이지 않는다.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    // 스위치 게이트가 먼저다(OFF 사용자에게 경로 존재를 알리지 않는다). requirePlanActor 는 읽기만 한다.
    const actor = await requirePlanActor();
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const { id } = await context.params;
    const projectId = requireUuidParam(id, "프로젝트");
    return planJson(await deleteProject(actor, projectId));
  } catch (err) {
    return handlePlanError(err);
  }
}
