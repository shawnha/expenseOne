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
import { commentBodySchema } from "@/lib/validations/plan";
import { createComment, listComments } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// GET  /api/plans/items/[id]/comments -- 메모 스레드(삭제된 메모는 body 가 빈 문자열)
// POST /api/plans/items/[id]/comments -- 메모 쓰기. 응답은 갱신된 스레드 전체
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const actor = await requirePlanActor();
    const id = requireUuidParam((await context.params).id, "계획");
    return planJson({ comments: await listComments(actor, id) });
  } catch (err) {
    return handlePlanError(err);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    // 스위치 게이트가 **먼저**다. 순서가 반대면 Origin 없는 요청에 403 이 나가, 스위치가 꺼진
    // 사용자도 "이 경로는 있다"는 사실을 알게 된다(없는 경로는 404). requirePlanActor 는 읽기만 한다.
    const actor = await requirePlanActor();
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const id = requireUuidParam((await context.params).id, "계획");
    const input = parseOrThrow(commentBodySchema, await readJson(request));
    return planJson({ comments: await createComment(actor, id, input) }, 201);
  } catch (err) {
    return handlePlanError(err);
  }
}
