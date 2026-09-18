import { NextResponse } from "next/server";
import { requireAuth, handleError } from "@/lib/api-utils";
import { isCostPlanningAllowed } from "@/lib/plans/flag";

// ---------------------------------------------------------------------------
// GET /api/plans/flag -- 이 사용자에게 비용계획 메뉴를 보여도 되나
//
// 계획 라우트 중 **유일하게 OFF 에서도 404 가 아닌** 엔드포인트다. 메뉴 게이트(PlansNavGate)가
// 이 한 번의 fetch 로 판단하고, 실패하거나 false 면 아무것도 렌더하지 않는다.
// 로그인 여부는 그대로 검사한다(비로그인 401).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    return NextResponse.json(
      { data: { enabled: await isCostPlanningAllowed(user.id) } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return handleError(err);
  }
}
