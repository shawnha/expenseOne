import { NextRequest } from "next/server";
import { handlePlanError, parseOrThrow, planJson, requirePlanActor } from "@/lib/plans/api";
import { boardQuerySchema, searchParamsToObject } from "@/lib/validations/plan";
import { getBoard } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// GET /api/plans/board?from=YYYY-MM&months=4&companyId=&projectId=&brandId=&status=
//
// 달별 그룹 + 달별 합계(PLANNED 만) + 카드. 필터 선택지(법인·사업·브랜드)도 같이 준다.
// from 이 없으면 서버가 KST 현재 달을 쓴다. brandId=none 은 "공통(브랜드 미지정)" 만.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await requirePlanActor();
    const query = parseOrThrow(boardQuerySchema, searchParamsToObject(request.nextUrl.searchParams));
    return planJson(await getBoard(actor, query));
  } catch (err) {
    return handlePlanError(err);
  }
}
