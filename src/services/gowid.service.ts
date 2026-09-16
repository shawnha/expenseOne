import { db } from "@/lib/db";
import {
  gowidCardMappings,
  gowidTransactions,
  users,
  companies,
  expenses,
} from "@/lib/db/schema";
import { eq, and, inArray, sql, isNull } from "drizzle-orm";
import {
  fetchGowidNotSubmitted,
  fetchGowidExpenses,
  extractCardLastFour,
  extractCardIssuer,
  getGowidConfigs,
  type GowidExpenseListItem,
} from "@/lib/gowid/client";
import { createNotification } from "./notification.service";
import { sendPushToUser } from "./push.service";
import { classifyMealExpense } from "./meal-classifier.service";
import { COMPANY_TO_ENTITY } from "@/lib/erp/meal-accounts";

// ---------------------------------------------------------------------------
// Card Mapping CRUD
// ---------------------------------------------------------------------------

export async function listCardMappings() {
  return db
    .select({
      id: gowidCardMappings.id,
      cardLastFour: gowidCardMappings.cardLastFour,
      cardAlias: gowidCardMappings.cardAlias,
      issuer: gowidCardMappings.issuer,
      userId: gowidCardMappings.userId,
      companyId: gowidCardMappings.companyId,
      isActive: gowidCardMappings.isActive,
      userName: users.name,
      userEmail: users.email,
    })
    .from(gowidCardMappings)
    .leftJoin(users, eq(gowidCardMappings.userId, users.id))
    .orderBy(gowidCardMappings.cardAlias);
}

/** 회사 범위 안에서 끝 4자리로 매핑을 찾는다. 회사 미지정은 그 자체가 한 범위. */
function sameCard(companyId: string | null) {
  return companyId
    ? eq(gowidCardMappings.companyId, companyId)
    : isNull(gowidCardMappings.companyId);
}

/**
 * 카드 매핑 생성/갱신. 같은 카드인지는 **(회사, 끝 4자리)**로 판단한다.
 *
 * ON CONFLICT를 쓰지 않고 조회 후 분기하는 이유: 대상 unique 인덱스가
 * 0014 마이그레이션으로 바뀌는데, ON CONFLICT는 인덱스가 없으면 쿼리 자체가
 * 실패한다. 이 방식은 옛 인덱스 상태에서도 동작한다(동기화는 순차 실행이라
 * 경합이 없고, 만약 있어도 unique 인덱스가 최종 방어선이다).
 */
export async function upsertCardMapping(data: {
  cardLastFour: string;
  cardAlias?: string | null;
  issuer?: string | null;
  userId?: string | null;
  companyId?: string | null;
}) {
  const companyId = data.companyId ?? null;

  const [existing] = await db
    .select({ id: gowidCardMappings.id })
    .from(gowidCardMappings)
    .where(
      and(eq(gowidCardMappings.cardLastFour, data.cardLastFour), sameCard(companyId)),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(gowidCardMappings)
      .set({
        cardAlias: data.cardAlias ?? undefined,
        issuer: data.issuer ?? undefined,
        userId: data.userId ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(gowidCardMappings.id, existing.id))
      .returning();
    if (updated && data.userId) {
      await claimUnownedTransactions(companyId, data.cardLastFour, data.userId);
    }
    return updated;
  }

  const [created] = await db
    .insert(gowidCardMappings)
    .values({
      cardLastFour: data.cardLastFour,
      cardAlias: data.cardAlias ?? null,
      issuer: data.issuer ?? null,
      userId: data.userId ?? null,
      companyId,
    })
    .returning();

  // 카드 발견은 거래 스테이징 **뒤**에 돈다. 그래서 새 카드의 첫 사용분은
  // 이미 user_id NULL로 들어가 있다 — 여기서 되찾는다.
  if (created && data.userId) {
    await claimUnownedTransactions(companyId, data.cardLastFour, data.userId);
  }
  return created;
}

/**
 * 이 카드의 **주인 없는 기존 거래**에 소유자를 붙인다.
 *
 * 동기화는 거래를 스테이징할 때의 매핑으로 user_id를 정한다. 그래서
 *  - 카드를 나중에 매핑하거나
 *  - 카드가 자동 발견되기 **전에** 그 카드 거래가 먼저 스테이징되면
 * 그 거래들은 user_id가 NULL인 채 영영 남아 **사용자 화면에 안 보인다.**
 * (실측: 전체 4,150건 중 1,925건이 주인 없음. 그중 30건은 지금 매핑된 카드 것)
 *
 * 알림은 보내지 않는다 — 몇 달 지난 거래로 알림이 쏟아지면 소음이고,
 * 목적은 "보이게 만드는 것"이지 "지금 등록하라"가 아니다.
 */
async function claimUnownedTransactions(
  companyId: string | null,
  cardLastFour: string,
  userId: string,
): Promise<number> {
  const claimed = await db
    .update(gowidTransactions)
    .set({ userId })
    .where(
      and(
        eq(gowidTransactions.cardLastFour, cardLastFour),
        isNull(gowidTransactions.userId),
        // 회사가 다른 같은 4자리 카드의 거래를 가져오면 안 된다.
        companyId
          ? sql`exists (
              select 1 from ${gowidCardMappings} m
              where m.card_last_four = ${cardLastFour}
                and m.company_id = ${companyId}
                and m.user_id = ${userId}
            )`
          : sql`true`,
      ),
    )
    .returning({ id: gowidTransactions.id });
  return claimed.length;
}

export async function updateCardMappingUser(
  mappingId: string,
  userId: string | null,
) {
  const [result] = await db
    .update(gowidCardMappings)
    .set({ userId, updatedAt: new Date() })
    .where(eq(gowidCardMappings.id, mappingId))
    .returning();

  // 매핑을 붙이는 순간 **그 카드의 밀린 거래도 함께 되찾는다.**
  if (result && userId) {
    const n = await claimUnownedTransactions(result.companyId, result.cardLastFour, userId);
    if (n > 0) {
      console.log(`[gowid] 카드 ${result.cardLastFour} 매핑 → 기존 거래 ${n}건에 소유자 지정`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Sync Logic
// ---------------------------------------------------------------------------

/**
 * 카드 등록 중 한 장이 실패해도 동기화 전체를 죽이지 않는다.
 *
 * 0014 마이그레이션 전에는 끝 4자리가 아직 전역 unique라, 다른 법인의 같은
 * 4자리 카드를 등록하려 하면 23505로 던진다. 그걸 그대로 두면 그 시점 이후의
 * 카드 등록이 전부 중단되고 거래 스테이징 결과까지 예외로 날아간다.
 * 로그로 드러내고 다음 카드로 넘어간다.
 */
async function registerCard(data: Parameters<typeof upsertCardMapping>[0]) {
  try {
    return await upsertCardMapping(data);
  } catch (err) {
    console.error(
      `[gowid] 카드 등록 실패 (끝 4자리 ${data.cardLastFour}, 회사 ${data.companyId ?? "미지정"}). ` +
        `끝 4자리가 아직 전역 unique면 drizzle/0014를 적용해야 한다.`,
      err,
    );
    return undefined;
  }
}

/**
 * 카드 하나를 가리키는 키. 끝 4자리는 회사 안에서만 유일하므로 회사를 함께 묶는다.
 * 회사 미지정(null)도 하나의 범위로 취급한다.
 */
function cardKey(companyId: string | null | undefined, lastFour: string): string {
  return `${companyId ?? ""}|${lastFour}`;
}

// ---------------------------------------------------------------------------
// 스테이징된 카드 거래 1건 처리 — 중복 판정 → 식비 자동분류 → 알림
//
// GoWid 동기화와 ERP(코데프) 동기화가 **같은 코드를 쓴다.** 예전엔 이 로직이
// gowid.service와 codef-notify.service에 복제돼 있어서, 한쪽만 고치면 다른 쪽이
// 조용히 옛 동작으로 남았다.
// ---------------------------------------------------------------------------

export type CardTxOutcome = "consumed" | "auto-classified" | "notified";

export async function processStagedCardTransaction(opts: {
  /** expenseone.gowid_transactions 의 행 id */
  stagedTxId: string;
  userId: string;
  companyId: string | null;
  /** 회사 slug — 식비 분류에서 FinanceOne 엔티티를 찾는 데 쓴다. */
  companySlug: string | null;
  amountKRW: number;
  currency: string;
  storeName: string | null;
  /** yyyy-mm-dd */
  transactionDate: string;
  cardLastFour: string;
}): Promise<CardTxOutcome> {
  const {
    stagedTxId, userId, companyId, companySlug,
    amountKRW, currency, storeName, transactionDate, cardLastFour,
  } = opts;

  // 중복 판정 — 사용자가 이미 같은 비용을 올렸는가.
  // (사용자 + 법카 + 금액 + 카드4자리 + 거래일 ±2일)
  const [alreadyExists] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(
      and(
        eq(expenses.submittedById, userId),
        eq(expenses.type, "CORPORATE_CARD"),
        eq(expenses.amount, amountKRW),
        eq(expenses.cardLastFour, cardLastFour),
        sql`${expenses.status} != 'CANCELLED'`,
        sql`${expenses.transactionDate}::date BETWEEN (${transactionDate}::date - INTERVAL '2 days') AND (${transactionDate}::date + INTERVAL '2 days')`,
        // **이미 다른 거래가 소비한 비용은 다시 쓰지 않는다.**
        // 없으면 자동 등록된 식비 1건이 같은 카드·같은 금액의 **다른 날 거래**까지
        // 삼켜서 그 거래가 영영 사라진다(실측 46건). 비용 1건은 거래 1건만 상쇄한다.
        sql`NOT EXISTS (
          SELECT 1 FROM ${gowidTransactions} g
          WHERE g.consumed_expense_id = ${expenses.id}
        )`,
      ),
    )
    .limit(1);

  if (alreadyExists) {
    // 무엇이 무엇을 삼켰는지 남긴다 — 예전엔 status만 바꿔 추적이 불가능했다.
    await db
      .update(gowidTransactions)
      .set({ status: "consumed", consumedExpenseId: alreadyExists.id, consumedAt: new Date() })
      .where(eq(gowidTransactions.id, stagedTxId));
    return "consumed";
  }

  // 식비 자동분류 — FinanceOne 룰로 식비면 APPROVED 비용을 자동 생성한다.
  if (companyId) {
    const entityId = companySlug ? (COMPANY_TO_ENTITY[companySlug] ?? null) : null;
    const mealMatch = await classifyMealExpense(storeName, entityId);

    if (mealMatch) {
      const [autoExp] = await db
        .insert(expenses)
        .values({
          type: "CORPORATE_CARD",
          status: "APPROVED",
          title: storeName ?? "법카 사용",
          amount: amountKRW,
          currency,
          category: mealMatch.accountName,
          merchantName: storeName,
          transactionDate,
          cardLastFour,
          companyId,
          submittedById: userId,
          approvedAt: new Date(),
          autoClassified: true,
          autoClassifiedSource: mealMatch.source,
          autoClassifiedAccountId: mealMatch.internalAccountId,
        })
        .returning();

      await db
        .update(gowidTransactions)
        .set({ status: "consumed", consumedExpenseId: autoExp?.id ?? null, consumedAt: new Date() })
        .where(eq(gowidTransactions.id, stagedTxId));

      // 자동 등록됐다는 사실은 **알려준다.**
      //
      // 예전엔 알림을 통째로 건너뛰었다(2026-04-29 배포). 사용자에게 할 일이 없으니
      // 조용히 넘긴 것인데, 실제로는 "내 카드가 쓰인 걸 시스템이 봤다"는 확인이
      // 사라져 **"알림이 안 뜬다"는 제보**로 돌아왔다(황은상 20건 중 18건).
      //
      // 등록 요청이 아니라 **확인 알림**이라 문구가 다르고, 푸시는 보내지 않는다 —
      // 한 사람당 월 18건까지 나와 OS 알림으로는 과하다. 인앱 알림이 들어가면
      // Realtime 토스트(팝업)도 함께 뜬다.
      if (autoExp) {
        await createNotification({
          recipientId: userId,
          type: "GOWID_NEW_TRANSACTION",
          title: "법카 사용이 자동 등록되었습니다",
          message: `${storeName ?? "법카 사용"} ${amountKRW.toLocaleString()}원 — ${mealMatch.accountName}(으)로 자동 등록됐습니다.`,
          linkUrl: `/expenses/${autoExp.id}`,
        });
        await db
          .update(gowidTransactions)
          .set({ notifiedAt: new Date() })
          .where(eq(gowidTransactions.id, stagedTxId));
      }
      return "auto-classified";
    }
  }

  // 일반 알림 — 사용자가 직접 등록해야 하는 건.
  const amountStr = amountKRW.toLocaleString();
  await createNotification({
    recipientId: userId,
    type: "GOWID_NEW_TRANSACTION",
    title: "법카 사용 내역 등록해주세요",
    message: `${storeName} ${amountStr}원 — 비용으로 등록해주세요.`,
    linkUrl: `/expenses/new/corporate-card?gowidTxId=${stagedTxId}`,
  });

  await db
    .update(gowidTransactions)
    .set({ notifiedAt: new Date() })
    .where(eq(gowidTransactions.id, stagedTxId));

  sendPushToUser(
    userId,
    "법카 사용 내역 등록해주세요",
    `${storeName} ${amountStr}원`,
    `/expenses/new/corporate-card?gowidTxId=${stagedTxId}`,
  ).catch((err) => console.error("[Push] 카드 거래 알림 실패:", err));

  return "notified";
}

export async function syncGowidTransactions(): Promise<{
  fetched: number;
  newStaged: number;
  notified: number;
  autoClassified: number;
}> {
  const configs = getGowidConfigs();
  if (configs.length === 0) {
    return { fetched: 0, newStaged: 0, notified: 0, autoClassified: 0 };
  }

  // Resolve company IDs for each config.
  //
  // config의 slug는 환경변수 이름(GOWID_API_KEY_<SLUG>)에서 왔으므로 오타가
  // 있을 수 있다. 매칭 실패해도 거래는 그대로 스테이징한다 — 회사 미지정으로
  // /admin/gowid에 남아 관리자가 고칠 수 있는 편이, 아예 안 보이는 것보다 낫다.
  // 대신 로그로 오타를 드러낸다.
  const allCompanyRows = await db.select({ id: companies.id, slug: companies.slug }).from(companies);
  const slugToId = new Map(allCompanyRows.map((c) => [c.slug, c.id]));
  for (const config of configs) {
    config.companyId = slugToId.get(config.companySlug) ?? undefined;
    if (!config.companyId) {
      console.warn(
        `[gowid] GOWID_API_KEY_${config.companySlug.toUpperCase()}의 slug "${config.companySlug}"와 ` +
          `일치하는 회사가 없습니다. 거래는 회사 미지정으로 저장됩니다. ` +
          `등록된 slug: ${allCompanyRows.map((c) => c.slug).join(", ")}`,
      );
    }
  }

  // 1. Fetch all not-submitted from all GoWid accounts (paginate)
  let allExpenses: (GowidExpenseListItem & { _companyId?: string })[] = [];
  for (const config of configs) {
    let page = 0;
    let hasMore = true;
    while (hasMore) {
      const result = await fetchGowidNotSubmitted(config.apiKey, page, 100);
      const withCompany = result.content.map((e) => ({ ...e, _companyId: config.companyId }));
      allExpenses = allExpenses.concat(withCompany);
      hasMore = !result.last;
      page++;
      if (page > 50) break;
    }
  }

  if (allExpenses.length === 0) {
    return { fetched: 0, newStaged: 0, notified: 0, autoClassified: 0 };
  }

  // 2. Check existing to skip duplicates — scope by source so the gowid
  // namespace doesn't collide with codef/financeone integer IDs.
  const gowidIds = allExpenses.map((e) => e.expenseId);
  const existing = await db
    .select({ gowidExpenseId: gowidTransactions.gowidExpenseId })
    .from(gowidTransactions)
    .where(
      and(
        eq(gowidTransactions.source, "gowid"),
        inArray(gowidTransactions.gowidExpenseId, gowidIds),
      ),
    );
  const existingSet = new Set(existing.map((e) => e.gowidExpenseId));

  // 3. Get card mappings
  //
  // 카드를 **(회사, 끝 4자리)**로 식별한다. 4자리만으로 찾으면 서로 다른 법인의
  // 카드가 같은 4자리로 끝나는 순간 한 매핑에 몰려서, 엉뚱한 사람에게 알림이 가고
  // 엉뚱한 법인 비용으로 잡힌다. 4자리는 10,000가지뿐이라 카드가 40장만 돼도
  // 겹칠 확률이 8%쯤 된다.
  const mappings = await db
    .select()
    .from(gowidCardMappings)
    .where(eq(gowidCardMappings.isActive, true));
  const cardToUser = new Map(
    mappings
      .filter((m) => m.userId)
      .map((m) => [
        cardKey(m.companyId, m.cardLastFour),
        { userId: m.userId!, companyId: m.companyId },
      ]),
  );
  const mappedCards = new Set(mappings.map((m) => cardKey(m.companyId, m.cardLastFour)));

  // 회사를 모르는 거래를 위한 폴백 색인.
  //
  // config의 slug가 회사와 매칭되지 않으면(오타 등) 거래의 회사가 undefined다.
  // 그러면 (회사, 4자리) 조회가 전부 빗나가 **이미 매핑된 카드까지 미매핑으로
  // 떨어진다** — 전역 키를 쓰던 예전보다 나빠진다. 그런 경우에만 4자리로
  // 물러서되, 후보가 **정확히 하나**일 때만 인정한다. 둘 이상이면 어느 회사
  // 것인지 알 수 없으므로 추측하지 않는다.
  const byLastFour = new Map<string, typeof mappings>();
  for (const m of mappings) {
    const list = byLastFour.get(m.cardLastFour) ?? [];
    list.push(m);
    byLastFour.set(m.cardLastFour, list);
  }
  /** 회사가 확정되지 않은 거래의 유일한 후보. 없거나 모호하면 null. */
  const soleMappingFor = (lastFour: string) => {
    const list = byLastFour.get(lastFour);
    return list && list.length === 1 ? list[0] : null;
  };

  // 4. Insert new transactions + auto-discover cards
  let newStaged = 0;
  let notified = 0;
  let autoClassifiedCount = 0;
  /** 아직 매핑이 없는 카드. cardKey(회사, 4자리) 형식. */
  const newCards = new Set<string>();

  // companyId → companySlug for entity lookup (classifier wants entity id)
  const companyIdToSlug = new Map<string, string>();
  for (const config of configs) {
    if (config.companyId) companyIdToSlug.set(config.companyId, config.companySlug);
  }

  for (const expense of allExpenses) {
    if (existingSet.has(expense.expenseId)) continue;

    const lastFour = extractCardLastFour(expense.shortCardNumber);
    const key = cardKey(expense._companyId, lastFour);

    // 회사를 아는 거래는 (회사, 4자리)로만 찾는다. 회사를 모를 때만 폴백.
    const fallback = expense._companyId ? null : soleMappingFor(lastFour);
    const mapping =
      cardToUser.get(key) ??
      (fallback?.userId ? { userId: fallback.userId, companyId: fallback.companyId } : undefined);

    if (!mappedCards.has(key) && !fallback) {
      newCards.add(key);
    }

    const [inserted] = await db.insert(gowidTransactions).values({
      source: "gowid",
      gowidExpenseId: expense.expenseId,
      userId: mapping?.userId ?? null,
      cardLastFour: lastFour,
      cardAlias: expense.cardAlias,
      expenseDate: expense.expenseDate,
      expenseTime: expense.expenseTime,
      amount: Math.round(expense.krwAmount),
      currency: expense.currency,
      storeName: expense.storeName,
      storeAddress: expense.storeAddress ?? null,
      status: "pending",
    }).returning();
    newStaged++;

    if (mapping?.userId && inserted) {
      const txDate = `${expense.expenseDate.slice(0, 4)}-${expense.expenseDate.slice(4, 6)}-${expense.expenseDate.slice(6, 8)}`;
      const outcome = await processStagedCardTransaction({
        stagedTxId: inserted.id,
        userId: mapping.userId,
        companyId: mapping.companyId,
        companySlug: mapping.companyId ? (companyIdToSlug.get(mapping.companyId) ?? null) : null,
        amountKRW: Math.round(expense.krwAmount),
        currency: expense.currency,
        storeName: expense.storeName,
        transactionDate: txDate,
        cardLastFour: lastFour,
      });
      if (outcome === "auto-classified") autoClassifiedCount++;
      else if (outcome === "notified") notified++;
    }
  }

  // 5. Discover ALL cards (from full expense history across all companies)
  let allForDiscovery: (GowidExpenseListItem & { _companyId?: string })[] = [];
  for (const config of configs) {
    let discPage = 0;
    let discMore = true;
    while (discMore) {
      const result = await fetchGowidExpenses(config.apiKey, discPage, 100);
      allForDiscovery = allForDiscovery.concat(
        result.content.map((e) => ({ ...e, _companyId: config.companyId })),
      );
      discMore = !result.last;
      discPage++;
      if (discPage > 50) break;
    }
  }

  // Merge cards from not-submitted + all expenses. We capture the issuer
  // here too so existing mappings can be back-filled in the next loop.
  //
  // 키가 cardKey(회사, 4자리)여야 한다. 4자리만으로 묶으면 두 법인이 같은 4자리
  // 카드를 가질 때 **먼저 본 쪽만 남고 나머지 회사 카드는 영영 발견되지 않는다.**
  const allCards = new Map<
    string,
    {
      lastFour: string;
      alias: string | null;
      companyId: string | undefined;
      issuer: string | null;
    }
  >();
  for (const e of [...allExpenses, ...allForDiscovery]) {
    const lf = extractCardLastFour(e.shortCardNumber);
    const iss = extractCardIssuer(e.shortCardNumber);
    const companyId = (e as { _companyId?: string })._companyId;
    const key = cardKey(companyId, lf);
    if (!allCards.has(key)) {
      allCards.set(key, { lastFour: lf, alias: e.cardAlias, companyId, issuer: iss });
    } else if (iss && !allCards.get(key)!.issuer) {
      // Fill in issuer from a later expense if the first one we saw didn't
      // have a clean prefix.
      allCards.get(key)!.issuer = iss;
    }
  }

  // Back-fill issuer on existing mappings whose `issuer` column is NULL.
  for (const m of mappings) {
    if (m.issuer) continue;
    const found = allCards.get(cardKey(m.companyId, m.cardLastFour));
    if (!found?.issuer) continue;
    await db
      .update(gowidCardMappings)
      .set({ issuer: found.issuer, updatedAt: new Date() })
      .where(eq(gowidCardMappings.id, m.id));
  }

  // Register any cards not yet in mappings
  for (const [key, info] of allCards) {
    const lastFour = info.lastFour;
    if (mappedCards.has(key)) continue;
    if (newCards.has(key)) continue;
    // 회사를 모르는 카드가 이미 유일한 매핑을 갖고 있으면 중복 등록하지 않는다.
    if (!info.companyId && soleMappingFor(lastFour)) continue;

    let autoUserId: string | null = null;
    if (info.alias) {
      const [matchedUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.name, info.alias))
        .limit(1);
      if (matchedUser) autoUserId = matchedUser.id;
    }
    await registerCard({
      cardLastFour: lastFour,
      cardAlias: info.alias ?? null,
      issuer: info.issuer,
      userId: autoUserId,
      companyId: info.companyId ?? null,
    });
  }

  // Also register cards from not-submitted that were new
  for (const key of newCards) {
    const matchingExpense = allExpenses.find(
      (e) => cardKey(e._companyId, extractCardLastFour(e.shortCardNumber)) === key,
    );
    if (!matchingExpense) continue;
    const lastFour = extractCardLastFour(matchingExpense.shortCardNumber);
    let autoUserId: string | null = null;
    if (matchingExpense.cardAlias) {
      const [matchedUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.name, matchingExpense.cardAlias))
        .limit(1);
      if (matchedUser) autoUserId = matchedUser.id;
    }
    await registerCard({
      cardLastFour: lastFour,
      cardAlias: matchingExpense.cardAlias ?? null,
      userId: autoUserId,
      companyId: matchingExpense._companyId ?? null,
    });
  }

  return { fetched: allExpenses.length, newStaged, notified, autoClassified: autoClassifiedCount };
}

// ---------------------------------------------------------------------------
// Consume staging (when user submits expense)
// ---------------------------------------------------------------------------

export async function consumeGowidTransaction(gowidTxId: string, expenseId: string) {
  const [updated] = await db
    .update(gowidTransactions)
    .set({
      status: "consumed",
      consumedExpenseId: expenseId,
      consumedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(gowidTransactions.id, gowidTxId),
        eq(gowidTransactions.status, "pending"),
      ),
    )
    .returning();
  return updated ?? null;
}

// ---------------------------------------------------------------------------
// Get pending transaction for prefill
// ---------------------------------------------------------------------------

export async function getPendingGowidTransaction(txId: string, userId: string) {
  const [tx] = await db
    .select()
    .from(gowidTransactions)
    .where(
      and(
        eq(gowidTransactions.id, txId),
        eq(gowidTransactions.userId, userId),
        eq(gowidTransactions.status, "pending"),
      ),
    )
    .limit(1);
  if (!tx) return null;

  // Resolve which company the card belongs to so the corporate-card form can
  // prefill the right entity. Without this, multi-company users could file
  // a card expense under the wrong company by accident.
  //
  // 끝 4자리는 회사별로만 유일하므로 **소유자까지 함께** 걸어야 한다. 4자리만
  // 보면 다른 법인의 같은 4자리 카드를 집어 회사가 뒤바뀔 수 있다. 이 거래는
  // 이미 userId로 잠겨 있으니(위 where) 그 사용자의 카드로 좁히면 유일해진다.
  let mappedCompanyId: string | null = null;
  if (tx.cardLastFour) {
    const [mapping] = await db
      .select({ companyId: gowidCardMappings.companyId })
      .from(gowidCardMappings)
      .where(
        and(
          eq(gowidCardMappings.cardLastFour, tx.cardLastFour),
          eq(gowidCardMappings.userId, userId),
        ),
      )
      .limit(1);
    mappedCompanyId = mapping?.companyId ?? null;
  }

  return { ...tx, mappedCompanyId };
}
