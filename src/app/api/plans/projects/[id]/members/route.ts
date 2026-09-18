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
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const actor = await requirePlanActor();
    const projectId = requireUuidParam((await context.params).id, "프로젝트");
    const input = parseOrThrow(projectMemberSchema, await readJson(request));
    return planJson({ members: await addProjectMember(actor, projectId, input.userId) }, 201);
  } catch (err) {
    return handlePlanError(err);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const actor = await requirePlanActor();
    const projectId = requireUuidParam((await context.params).id, "프로젝트");
    const input = parseOrThrow(projectMemberSchema, searchParamsToObject(request.nextUrl.searchParams));
    return planJson({ members: await removeProjectMember(actor, projectId, input.userId) });
  } catch (err) {
    return handlePlanError(err);
  }
}
