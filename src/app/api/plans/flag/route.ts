import { NextResponse } from "next/server";
import { handleError } from "@/lib/api-utils";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { isCostPlanningAllowed } from "@/lib/plans/flag";

// ---------------------------------------------------------------------------
// GET /api/plans/flag -- 이 사용자에게 비용계획 메뉴를 보여도 되나
//
// 계획 라우트 중 **유일하게 OFF 에서도 404 가 아닌** 엔드포인트다. 메뉴 게이트(PlansNavGate)가
// 이 한 번의 fetch 로 판단하고, 실패하거나 false 면 아무것도 렌더하지 않는다.
// 로그인 여부는 그대로 검사한다(비로그인 401).
//
// 사용자 조회는 requireAuth 가 아니라 **getCachedCurrentUser** 로 한다. 이 경로는 메뉴 게이트 때문에
// 사실상 모든 대시보드 화면에서 한 번씩 불린다 — requireAuth 는 캐시 없는 users SELECT 를 공용 풀(max 5)에
// 매번 날리므로, 나머지 앱과 같은 60초 Data Cache 를 타야 한다(P7 핫 경로 불변).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCachedCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다." } },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { data: { enabled: await isCostPlanningAllowed(user.id) } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return handleError(err);
  }
}
