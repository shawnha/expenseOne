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
import { classifyMealExpense } from "./financeone-classifier.service";
import { COMPANY_TO_ENTITY } from "@/lib/financeone/meal-accounts";

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
  return created;
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
      // Dedup before notifying. Tight match prevents an unrelated same-amount
      // expense from swallowing a real GoWid transaction:
      // user + type + amount + card last 4 + transactionDate within 2 days
      // of the GoWid expenseDate. Matching on the staged transaction's
      // gowidTxId is even tighter, but the prefill flow only writes that
      // when the form was opened from a notification — so the date+card
      // window covers both "filed from prefill" and "filed manually".
      const expenseDateStr = expense.expenseDate; // yyyy-mm-dd
      const [alreadyExists] = await db
        .select({ id: expenses.id })
        .from(expenses)
        .where(
          and(
            eq(expenses.submittedById, mapping.userId),
            eq(expenses.type, "CORPORATE_CARD"),
            eq(expenses.amount, Math.round(expense.krwAmount)),
            eq(expenses.cardLastFour, lastFour),
            sql`${expenses.status} != 'CANCELLED'`,
            sql`${expenses.transactionDate}::date BETWEEN (${expenseDateStr}::date - INTERVAL '2 days') AND (${expenseDateStr}::date + INTERVAL '2 days')`,
          ),
        )
        .limit(1);

      if (alreadyExists) {
        // Mark as consumed — user already submitted
        await db.update(gowidTransactions).set({ status: "consumed" }).where(eq(gowidTransactions.id, inserted.id));
        continue;
      }

      // ---------------------------------------------------------------
      // Meal auto-classification: if FinanceOne classifies this merchant
      // as a meal-leaf account, create an APPROVED expense automatically
      // and skip the user-facing notification.
      // ---------------------------------------------------------------
      if (mapping.companyId) {
        const slug = companyIdToSlug.get(mapping.companyId);
        const entityId = slug ? (COMPANY_TO_ENTITY[slug] ?? null) : null;
        const mealMatch = await classifyMealExpense(expense.storeName, entityId);

        if (mealMatch) {
          const txDate = `${expense.expenseDate.slice(0, 4)}-${expense.expenseDate.slice(4, 6)}-${expense.expenseDate.slice(6, 8)}`;
          const [autoExp] = await db
            .insert(expenses)
            .values({
              type: "CORPORATE_CARD",
              status: "APPROVED",
              title: expense.storeName ?? "법카 사용",
              amount: Math.round(expense.krwAmount),
              currency: expense.currency,
              category: mealMatch.accountName,
              merchantName: expense.storeName,
              transactionDate: txDate,
              cardLastFour: lastFour,
              companyId: mapping.companyId,
              submittedById: mapping.userId,
              approvedAt: new Date(),
              autoClassified: true,
              autoClassifiedSource: mealMatch.source,
              autoClassifiedAccountId: mealMatch.internalAccountId,
            })
            .returning();

          await db
            .update(gowidTransactions)
            .set({
              status: "consumed",
              consumedExpenseId: autoExp?.id ?? null,
              consumedAt: new Date(),
            })
            .where(eq(gowidTransactions.id, inserted.id));

          autoClassifiedCount++;
          continue;
        }
      }

      const amountStr = Math.round(expense.krwAmount).toLocaleString();
      await createNotification({
        recipientId: mapping.userId,
        type: "GOWID_NEW_TRANSACTION",
        title: "법카 사용 내역 등록해주세요",
        message: `${expense.storeName} ${amountStr}원 — 비용으로 등록해주세요.`,
        linkUrl: `/expenses/new/corporate-card?gowidTxId=${inserted.id}`,
      });

      await db
        .update(gowidTransactions)
        .set({ notifiedAt: new Date() })
        .where(eq(gowidTransactions.id, inserted.id));

      sendPushToUser(
        mapping.userId,
        "법카 사용 내역 등록해주세요",
        `${expense.storeName} ${amountStr}원`,
        `/expenses/new/corporate-card?gowidTxId=${inserted.id}`,
      ).catch((err) => console.error("[Push] GoWid 알림 실패:", err));

      notified++;
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
