import { NextRequest } from "next/server";
import {
  handlePlanError,
  parseOrThrow,
  planJson,
  requirePlanActor,
  requireUuidParam,
} from "@/lib/plans/api";
import { linkCandidatesQuerySchema, searchParamsToObject } from "@/lib/validations/plan";
import { listLinkCandidates } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// GET /api/plans/items/[id]/link-candidates?q=제목검색
//
// 같은 법인의 KRW 입금요청 중 반려·취소가 아니고 아직 연결되지 않은 것 최대 50건.
// MEMBER 는 본인이 제출한 요청만 본다(연결 범위, SCHEMA.md 5절 7).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const actor = await requirePlanActor();
    const id = requireUuidParam((await context.params).id, "계획");
    const query = parseOrThrow(linkCandidatesQuerySchema, searchParamsToObject(request.nextUrl.searchParams));
    return planJson({ candidates: await listLinkCandidates(actor, id, query.q) });
  } catch (err) {
    return handlePlanError(err);
  }
}
