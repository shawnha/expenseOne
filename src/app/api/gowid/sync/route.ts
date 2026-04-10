import { NextResponse } from "next/server";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { syncGowidTransactions } from "@/services/gowid.service";

export async function POST() {
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
