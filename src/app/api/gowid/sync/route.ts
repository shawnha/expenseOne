import { NextRequest, NextResponse } from "next/server";
import { validateOrigin } from "@/lib/api-utils";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { syncGowidTransactions } from "@/services/gowid.service";
import { syncErpCardTransactions } from "@/services/erp-card-sync.service";

// 고위드+ERP를 한 번에 돌려서 cron과 같은 여유를 준다.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // 다른 관리자 변경 API와 동일하게 Origin을 검증한다. 없으면 로그인한 관리자가
  // 악성 페이지를 여는 것만으로 동기화가 트리거될 수 있다.
  const csrfError = validateOrigin(request);
  if (csrfError) return csrfError;

  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다" } }, { status: 401 });
  }

  const supabase = await getCachedClient();
  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "관리자만 접근 가능합니다" } }, { status: 403 });
  }

  // 카드 관리의 "동기화"는 **모든 카드**를 새로 불러오는 버튼이어야 한다.
  // 고위드만 돌리면 코데프로 들어오는 우리카드는 이 버튼으로 절대 안 뜬다.
  // cron과 같은 이유로 ERP를 먼저, 고위드 실패와 무관하게 돌린다.
  let erp: unknown = null;
  try {
    erp = await syncErpCardTransactions();
  } catch (err) {
    console.error("[ERP Card Manual Sync] Error:", err);
    erp = { error: err instanceof Error ? err.message : "erp sync failed" };
  }

  try {
    const result = await syncGowidTransactions();
    return NextResponse.json({ ok: true, ...result, erp });
  } catch (error) {
    console.error("[GoWid Manual Sync] Error:", error);
    return NextResponse.json(
      { error: { code: "SYNC_FAILED", message: error instanceof Error ? error.message : "동기화 실패" }, erp },
      { status: 500 },
    );
  }
}
