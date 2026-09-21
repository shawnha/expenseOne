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
    // 스위치 게이트가 **먼저**다. 순서가 반대면 Origin 없는 요청에 403 이 나가, 스위치가 꺼진
    // 사용자도 "이 경로는 있다"는 사실을 알게 된다(없는 경로는 404). requirePlanActor 는 읽기만 한다.
    const actor = await requirePlanActor();
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const input = parseOrThrow(createProjectSchema, await readJson(request));
    return planJson({ project: await createProject(actor, input) }, 201);
  } catch (err) {
    return handlePlanError(err);
  }
}
