import { NextRequest, NextResponse } from "next/server";
import { validateOrigin } from "@/lib/api-utils";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { syncGowidTransactions } from "@/services/gowid.service";

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

  try {
    const result = await syncGowidTransactions();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[GoWid Manual Sync] Error:", error);
    return NextResponse.json(
      { error: { code: "SYNC_FAILED", message: error instanceof Error ? error.message : "동기화 실패" } },
      { status: 500 },
    );
  }
}
