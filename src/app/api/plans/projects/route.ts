import { NextRequest } from "next/server";
import { validateOrigin } from "@/lib/api-utils";
import { handlePlanError, parseOrThrow, planJson, readJson, requirePlanActor } from "@/lib/plans/api";
import { createProjectSchema, projectsQuerySchema, searchParamsToObject } from "@/lib/validations/plan";
import { createProject, listProjects } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// GET  /api/plans/projects -- 내가 볼 수 있는 사업 + 참여자 + 법인 선택지
// POST /api/plans/projects -- 사업 만들기 (같은 트랜잭션에서 본인이 참여자로 들어간다)
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await requirePlanActor();
    const query = parseOrThrow(projectsQuerySchema, searchParamsToObject(request.nextUrl.searchParams));
    return planJson(await listProjects(actor, query.companyId));
  } catch (err) {
    return handlePlanError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const actor = await requirePlanActor();
    const input = parseOrThrow(createProjectSchema, await readJson(request));
    return planJson({ project: await createProject(actor, input) }, 201);
  } catch (err) {
    return handlePlanError(err);
  }
}
