import { db } from "@/lib/db";
import {
  gowidCardMappings,
  gowidTransactions,
  users,
  companies,
  expenses,
} from "@/lib/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  fetchGowidNotSubmitted,
  fetchGowidExpenses,
  extractCardLastFour,
  getGowidConfigs,
  type GowidExpenseListItem,
} from "@/lib/gowid/client";
import { createNotification } from "./notification.service";
import { sendPushToUser } from "./push.service";

// ---------------------------------------------------------------------------
// Card Mapping CRUD
// ---------------------------------------------------------------------------

export async function listCardMappings() {
  return db
    .select({
      id: gowidCardMappings.id,
      cardLastFour: gowidCardMappings.cardLastFour,
      cardAlias: gowidCardMappings.cardAlias,
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

export async function upsertCardMapping(data: {
  cardLastFour: string;
  cardAlias?: string | null;
  userId?: string | null;
  companyId?: string | null;
}) {
  const [result] = await db
    .insert(gowidCardMappings)
    .values({
      cardLastFour: data.cardLastFour,
      cardAlias: data.cardAlias ?? null,
      userId: data.userId ?? null,
      companyId: data.companyId ?? null,
    })
    .onConflictDoUpdate({
      target: gowidCardMappings.cardLastFour,
      set: {
        cardAlias: data.cardAlias ?? undefined,
        userId: data.userId ?? undefined,
        companyId: data.companyId ?? undefined,
        updatedAt: new Date(),
      },
    })
    .returning();
  return result;
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

export async function syncGowidTransactions(): Promise<{
  fetched: number;
  newStaged: number;
  notified: number;
}> {
  const configs = getGowidConfigs();
  if (configs.length === 0) {
    return { fetched: 0, newStaged: 0, notified: 0 };
  }

  // Resolve company IDs for each config
  const allCompanyRows = await db.select({ id: companies.id, slug: companies.slug }).from(companies);
  const slugToId = new Map(allCompanyRows.map((c) => [c.slug, c.id]));
  for (const config of configs) {
    config.companyId = slugToId.get(config.companySlug) ?? undefined;
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
    return { fetched: 0, newStaged: 0, notified: 0 };
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
  const mappings = await db
    .select()
    .from(gowidCardMappings)
    .where(eq(gowidCardMappings.isActive, true));
  const cardToUser = new Map(
    mappings
      .filter((m) => m.userId)
      .map((m) => [m.cardLastFour, { userId: m.userId!, companyId: m.companyId }]),
  );

  // 4. Insert new transactions + auto-discover cards
  let newStaged = 0;
  let notified = 0;
  const newCardLastFours = new Set<string>();

  for (const expense of allExpenses) {
    if (existingSet.has(expense.expenseId)) continue;

    const lastFour = extractCardLastFour(expense.shortCardNumber);
    const mapping = cardToUser.get(lastFour);

    if (!mappings.find((m) => m.cardLastFour === lastFour)) {
      newCardLastFours.add(lastFour);
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

  // Merge cards from not-submitted + all expenses
  const allCards = new Map<string, { alias: string | null; companyId: string | undefined }>();
  for (const e of [...allExpenses, ...allForDiscovery]) {
    const lf = extractCardLastFour(e.shortCardNumber);
    if (!allCards.has(lf)) {
      allCards.set(lf, { alias: e.cardAlias, companyId: (e as { _companyId?: string })._companyId });
    }
  }

  // Register any cards not yet in mappings
  for (const [lastFour, info] of allCards) {
    if (mappings.find((m) => m.cardLastFour === lastFour)) continue;
    if (newCardLastFours.has(lastFour)) continue;

    let autoUserId: string | null = null;
    if (info.alias) {
      const [matchedUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.name, info.alias))
        .limit(1);
      if (matchedUser) autoUserId = matchedUser.id;
    }
    await upsertCardMapping({
      cardLastFour: lastFour,
      cardAlias: info.alias ?? null,
      userId: autoUserId,
      companyId: info.companyId ?? null,
    });
  }

  // Also register cards from not-submitted that were new
  for (const lastFour of newCardLastFours) {
    const matchingExpense = allExpenses.find(
      (e) => extractCardLastFour(e.shortCardNumber) === lastFour,
    );
    let autoUserId: string | null = null;
    if (matchingExpense?.cardAlias) {
      const [matchedUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.name, matchingExpense.cardAlias))
        .limit(1);
      if (matchedUser) autoUserId = matchedUser.id;
    }
    await upsertCardMapping({
      cardLastFour: lastFour,
      cardAlias: matchingExpense?.cardAlias ?? null,
      userId: autoUserId,
      companyId: (matchingExpense as { _companyId?: string })?._companyId ?? null,
    });
  }

  return { fetched: allExpenses.length, newStaged, notified };
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
  let mappedCompanyId: string | null = null;
  if (tx.cardLastFour) {
    const [mapping] = await db
      .select({ companyId: gowidCardMappings.companyId })
      .from(gowidCardMappings)
      .where(eq(gowidCardMappings.cardLastFour, tx.cardLastFour))
      .limit(1);
    mappedCompanyId = mapping?.companyId ?? null;
  }

  return { ...tx, mappedCompanyId };
}
