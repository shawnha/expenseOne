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
import { linkExpenseSchema, unlinkQuerySchema, searchParamsToObject } from "@/lib/validations/plan";
import { linkExpense, unlinkExpense } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// POST   /api/plans/items/[id]/links          body { expenseId }
// DELETE /api/plans/items/[id]/links?linkId=…
//
// 스냅샷 값은 서버가 SELECT 로만 만든다 — 클라이언트가 보내는 건 expenseId 뿐(결정 1-2).
// 이미 다른 계획에 연결된 요청은 409. 해제는 소프트(unlinked_at)라 스냅샷 행은 남는다.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const actor = await requirePlanActor();
    const id = requireUuidParam((await context.params).id, "계획");
    const input = parseOrThrow(linkExpenseSchema, await readJson(request));
    return planJson(await linkExpense(actor, id, input.expenseId), 201);
  } catch (err) {
    return handlePlanError(err);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const actor = await requirePlanActor();
    const id = requireUuidParam((await context.params).id, "계획");
    const query = parseOrThrow(unlinkQuerySchema, searchParamsToObject(request.nextUrl.searchParams));
    return planJson(await unlinkExpense(actor, id, query.linkId));
  } catch (err) {
    return handlePlanError(err);
  }
}
