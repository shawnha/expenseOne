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
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const actor = await requirePlanActor();
    const id = requireUuidParam((await context.params).id, "계획");
    const input = parseOrThrow(commentBodySchema, await readJson(request));
    return planJson({ comments: await createComment(actor, id, input) }, 201);
  } catch (err) {
    return handlePlanError(err);
  }
}
