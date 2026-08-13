import { NextResponse, type NextRequest } from "next/server";
import { validateOrigin } from "@/lib/api-utils";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { listCardMappings, updateCardMappingUser } from "@/services/gowid.service";
import { db } from "@/lib/db";
import { gowidCardMappings, companies, users } from "@/lib/db/schema";
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

  // Member (or admin with scope=mine): return own cards + unmapped cards + company list
  const [myCards, unmappedCards, companyList] = await Promise.all([
    db
      .select({
        id: gowidCardMappings.id,
        cardLastFour: gowidCardMappings.cardLastFour,
        cardAlias: gowidCardMappings.cardAlias,
        issuer: gowidCardMappings.issuer,
        userId: gowidCardMappings.userId,
        companyId: gowidCardMappings.companyId,
        companyName: companies.name,
      })
      .from(gowidCardMappings)
      .leftJoin(companies, eq(gowidCardMappings.companyId, companies.id))
      .where(eq(gowidCardMappings.userId, authUser.id)),
    db
      .select({
        id: gowidCardMappings.id,
        cardLastFour: gowidCardMappings.cardLastFour,
        cardAlias: gowidCardMappings.cardAlias,
        issuer: gowidCardMappings.issuer,
        companyId: gowidCardMappings.companyId,
        companyName: companies.name,
      })
      .from(gowidCardMappings)
      .leftJoin(companies, eq(gowidCardMappings.companyId, companies.id))
      .where(isNull(gowidCardMappings.userId)),
    db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.isActive, true))
      .orderBy(companies.sortOrder),
  ]);

  return NextResponse.json({ myCards, unmappedCards, companies: companyList });
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
  const { mappingId, companyId, issuer } = body as {
    mappingId: string;
    userId?: string | null;
    companyId?: string | null;
    issuer?: string | null;
  };
  let userId = (body as { userId?: string | null }).userId;

  // "self" = assign to current user
  if (userId === "self") userId = authUser.id;

  if (!mappingId) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "mappingId 필수" } }, { status: 400 });
  }

  // Handle issuer update — admin only.
  if (issuer !== undefined) {
    if (!isAdmin) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "관리자만 발급사를 변경할 수 있습니다" } },
        { status: 403 },
      );
    }
    const normalized = issuer === null ? null : String(issuer).trim() || null;
    await db
      .update(gowidCardMappings)
      .set({ issuer: normalized, updatedAt: new Date() })
      .where(eq(gowidCardMappings.id, mappingId));
    if (userId === undefined && companyId === undefined) {
      return NextResponse.json({ ok: true });
    }
  }

  // Handle companyId update
  if (companyId !== undefined) {
    // Non-admin can set company only when assigning to self
    if (!isAdmin && !(userId === authUser.id || userId === "self")) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "관리자만 회사를 변경할 수 있습니다" } }, { status: 403 });
    }
    await db.update(gowidCardMappings).set({
      companyId: companyId,
      updatedAt: new Date(),
    }).where(eq(gowidCardMappings.id, mappingId));
    if (userId === undefined) {
      return NextResponse.json({ ok: true });
    }
  }

  // Non-admin: can only assign to self or unassign own cards
  if (!isAdmin && userId !== undefined) {
    if (userId && userId !== authUser.id) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "본인에게만 카드를 매핑할 수 있습니다" } }, { status: 403 });
    }
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

  const updated = userId !== undefined
    ? await updateCardMappingUser(mappingId, userId)
    : { id: mappingId };
  if (!updated) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "매핑을 찾을 수 없습니다" } }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}

// ---------------------------------------------------------------------------
// POST — 카드 매핑 수동 생성 (ADMIN 전용)
//
// 지금까지 카드는 GoWid 동기화로만 등록됐다. 그래서 아직 동기화되지 않은 새 카드나
// GoWid 키가 없는 법인(예: 파트너스)의 카드는 **어디서도 추가할 수 없었다.**
// 사용자 관리에서 번호를 직접 넣을 수 있게 열어준다.
//
// 동기화는 이미 존재하는 cardLastFour를 건너뛰므로(gowid.service.ts) 수동으로
// 만든 행을 덮어쓰거나 중복 생성하지 않는다.
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const csrfError = validateOrigin(request as NextRequest);
  if (csrfError) return csrfError;

  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다" } },
      { status: 401 },
    );
  }

  const supabase = await getCachedClient();
  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (me?.role !== "ADMIN") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "관리자만 카드를 추가할 수 있습니다" } },
      { status: 403 },
    );
  }

  const body = (await request.json()) as {
    cardLastFour?: string;
    userId?: string | null;
    companyId?: string | null;
    cardAlias?: string | null;
  };

  const cardLastFour = String(body.cardLastFour ?? "").trim();
  if (!/^\d{4}$/.test(cardLastFour)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "카드 끝 4자리를 숫자로 입력해주세요." } },
      { status: 400 },
    );
  }

  // 뒷 4자리는 전역 unique다. 이미 있으면 누구 것인지 알려줘서 관리자가
  // '+ 카드'로 매핑하면 되는지, 다른 사람 카드인지 판단할 수 있게 한다.
  const [existing] = await db
    .select({
      id: gowidCardMappings.id,
      userId: gowidCardMappings.userId,
    })
    .from(gowidCardMappings)
    .where(eq(gowidCardMappings.cardLastFour, cardLastFour));

  if (existing) {
    if (!existing.userId) {
      return NextResponse.json(
        {
          error: {
            code: "ALREADY_EXISTS",
            message: `끝 4자리 ${cardLastFour} 카드는 이미 등록돼 있습니다. '+ 카드'에서 선택해 매핑하세요.`,
          },
        },
        { status: 409 },
      );
    }
    const [owner] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, existing.userId));
    return NextResponse.json(
      {
        error: {
          code: "ALREADY_EXISTS",
          message: `끝 4자리 ${cardLastFour} 카드는 이미 ${owner?.name ?? "다른 사용자"}에게 매핑돼 있습니다.`,
        },
      },
      { status: 409 },
    );
  }

  // 회사를 안 넘기면 대상 사용자의 소속을 따른다. 회사가 지정돼야 그 카드
  // 거래가 해당 법인 비용으로 잡힌다.
  let resolvedCompanyId = body.companyId ?? null;
  if (!resolvedCompanyId && body.userId) {
    const [target] = await db
      .select({ companyId: users.companyId })
      .from(users)
      .where(eq(users.id, body.userId));
    resolvedCompanyId = target?.companyId ?? null;
  }

  const [created] = await db
    .insert(gowidCardMappings)
    .values({
      cardLastFour,
      cardAlias: body.cardAlias?.trim() || null,
      userId: body.userId ?? null,
      companyId: resolvedCompanyId,
      isActive: true,
    })
    .returning();

  return NextResponse.json({ data: created }, { status: 201 });
}
