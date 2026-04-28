import { NextResponse } from "next/server";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { listCardMappings, updateCardMappingUser } from "@/services/gowid.service";
import { db } from "@/lib/db";
import { gowidCardMappings } from "@/lib/db/schema";
import { eq, isNull } from "drizzle-orm";

// GET — list card mappings
// Admin: all mappings; Member: own cards + unmapped cards
export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope"); // "mine" for user's own cards

  if (user?.role === "ADMIN" && scope !== "mine") {
    const mappings = await listCardMappings();
    return NextResponse.json({ data: mappings });
  }

  // Member (or admin with scope=mine): return own cards + unmapped cards
  const [myCards, unmappedCards] = await Promise.all([
    db
      .select({
        id: gowidCardMappings.id,
        cardLastFour: gowidCardMappings.cardLastFour,
        cardAlias: gowidCardMappings.cardAlias,
        userId: gowidCardMappings.userId,
      })
      .from(gowidCardMappings)
      .where(eq(gowidCardMappings.userId, authUser.id)),
    db
      .select({
        id: gowidCardMappings.id,
        cardLastFour: gowidCardMappings.cardLastFour,
        cardAlias: gowidCardMappings.cardAlias,
      })
      .from(gowidCardMappings)
      .where(isNull(gowidCardMappings.userId)),
  ]);

  return NextResponse.json({ myCards, unmappedCards });
}

// PATCH — update mapping userId
// Admin: can assign any user; Member: can only assign self or unassign own cards
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

  const isAdmin = user?.role === "ADMIN";

  const body = await request.json();
  let { mappingId, userId } = body as { mappingId: string; userId: string | null };

  // "self" = assign to current user
  if (userId === "self") userId = authUser.id;

  if (!mappingId) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "mappingId 필수" } }, { status: 400 });
  }

  // Non-admin: can only assign to self or unassign own cards
  if (!isAdmin) {
    if (userId && userId !== authUser.id) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "본인에게만 카드를 매핑할 수 있습니다" } }, { status: 403 });
    }
    // If unassigning (userId=null), verify the card belongs to this user
    if (userId === null) {
      const [mapping] = await db
        .select({ userId: gowidCardMappings.userId })
        .from(gowidCardMappings)
        .where(eq(gowidCardMappings.id, mappingId));
      if (mapping?.userId !== authUser.id) {
        return NextResponse.json({ error: { code: "FORBIDDEN", message: "본인의 카드만 해제할 수 있습니다" } }, { status: 403 });
      }
    }
  }

  const updated = await updateCardMappingUser(mappingId, userId);
  if (!updated) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "매핑을 찾을 수 없습니다" } }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}
