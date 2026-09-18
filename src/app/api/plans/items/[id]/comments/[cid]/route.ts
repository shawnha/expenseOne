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
import { deleteComment, updateComment } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// PATCH  /api/plans/items/[id]/comments/[cid] -- 본인 메모 수정
// DELETE /api/plans/items/[id]/comments/[cid] -- 본인 메모 삭제(body 를 비우고 deleted_at)
//
// 남의 메모면 403. 이미 지워진 메모도 403(작성자여도 못 고친다).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; cid: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    // 스위치 게이트가 **먼저**다. 순서가 반대면 Origin 없는 요청에 403 이 나가, 스위치가 꺼진
    // 사용자도 "이 경로는 있다"는 사실을 알게 된다(없는 경로는 404). requirePlanActor 는 읽기만 한다.
    const actor = await requirePlanActor();
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const params = await context.params;
    const id = requireUuidParam(params.id, "계획");
    const cid = requireUuidParam(params.cid, "메모");
    const input = parseOrThrow(commentBodySchema, await readJson(request));
    return planJson({ comments: await updateComment(actor, id, cid, input) });
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
    const params = await context.params;
    const id = requireUuidParam(params.id, "계획");
    const cid = requireUuidParam(params.cid, "메모");
    return planJson({ comments: await deleteComment(actor, id, cid) });
  } catch (err) {
    return handlePlanError(err);
  }
}
