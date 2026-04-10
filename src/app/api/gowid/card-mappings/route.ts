import { NextResponse } from "next/server";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { listCardMappings, updateCardMappingUser } from "@/services/gowid.service";

export async function GET() {
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

  const mappings = await listCardMappings();
  return NextResponse.json({ data: mappings });
}

export async function PATCH(request: Request) {
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

  const body = await request.json();
  const { mappingId, userId } = body as { mappingId: string; userId: string | null };

  if (!mappingId) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "mappingId 필수" } }, { status: 400 });
  }

  const updated = await updateCardMappingUser(mappingId, userId);
  if (!updated) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "매핑을 찾을 수 없습니다" } }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}
