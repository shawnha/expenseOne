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
import { projectMemberSchema, searchParamsToObject } from "@/lib/validations/plan";
import { addProjectMember, removeProjectMember } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// POST   /api/plans/projects/[id]/members       body { userId }
// DELETE /api/plans/projects/[id]/members?userId=…
//
// 참여자 행이 유일한 권한 근거라서 마지막 한 명은 지울 수 없다(409).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // 스위치 게이트가 **먼저**다. 순서가 반대면 Origin 없는 요청에 403 이 나가, 스위치가 꺼진
    // 사용자도 "이 경로는 있다"는 사실을 알게 된다(없는 경로는 404). requirePlanActor 는 읽기만 한다.
    const actor = await requirePlanActor();
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const projectId = requireUuidParam((await context.params).id, "프로젝트");
    const input = parseOrThrow(projectMemberSchema, await readJson(request));
    return planJson({ members: await addProjectMember(actor, projectId, input.userId) }, 201);
  } catch (err) {
    return handlePlanError(err);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    // 스위치 게이트가 **먼저**다. 순서가 반대면 Origin 없는 요청에 403 이 나가, 스위치가 꺼진
    // 사용자도 "이 경로는 있다"는 사실을 알게 된다(없는 경로는 404). requirePlanActor 는 읽기만 한다.
    const actor = await requirePlanActor();
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const projectId = requireUuidParam((await context.params).id, "프로젝트");
    const input = parseOrThrow(projectMemberSchema, searchParamsToObject(request.nextUrl.searchParams));
    return planJson({ members: await removeProjectMember(actor, projectId, input.userId) });
  } catch (err) {
    return handlePlanError(err);
  }
}
