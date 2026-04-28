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
  // Default company for new cards (GoWid API key is for 한아원코리아)
  const [defaultCompany] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.slug, "korea"))
    .limit(1);
  const defaultCompanyId = defaultCompany?.id ?? null;

  // 1. Fetch all not-submitted from GoWid (paginate)
  let allExpenses: GowidExpenseListItem[] = [];
  let page = 0;
  let hasMore = true;
  while (hasMore) {
    const result = await fetchGowidNotSubmitted(page, 100);
    allExpenses = allExpenses.concat(result.content);
    hasMore = !result.last;
    page++;
    if (page > 50) break;
  }

  if (allExpenses.length === 0) {
    return { fetched: 0, newStaged: 0, notified: 0 };
  }

  // 2. Check existing to skip duplicates
  const gowidIds = allExpenses.map((e) => e.expenseId);
  const existing = await db
    .select({ gowidExpenseId: gowidTransactions.gowidExpenseId })
    .from(gowidTransactions)
    .where(inArray(gowidTransactions.gowidExpenseId, gowidIds));
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
      // Check if user already submitted an expense for this transaction
      const [alreadyExists] = await db
        .select({ id: expenses.id })
        .from(expenses)
        .where(
          and(
            eq(expenses.submittedById, mapping.userId),
            eq(expenses.type, "CORPORATE_CARD"),
            eq(expenses.amount, Math.round(expense.krwAmount)),
            sql`${expenses.status} != 'CANCELLED'`,
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

  // 5. Discover ALL cards (from full expense history, not just not-submitted)
  // This ensures cards with no pending transactions are also registered
  let allForDiscovery: GowidExpenseListItem[] = [];
  let discPage = 0;
  let discMore = true;
  while (discMore) {
    const result = await fetchGowidExpenses(discPage, 100);
    allForDiscovery = allForDiscovery.concat(result.content);
    discMore = !result.last;
    discPage++;
    if (discPage > 50) break;
  }

  // Merge cards from not-submitted + all expenses
  const allCards = new Map<string, string | null>();
  for (const e of [...allExpenses, ...allForDiscovery]) {
    const lf = extractCardLastFour(e.shortCardNumber);
    if (!allCards.has(lf)) {
      allCards.set(lf, e.cardAlias);
    }
  }

  // Register any cards not yet in mappings
  for (const [lastFour, alias] of allCards) {
    if (mappings.find((m) => m.cardLastFour === lastFour)) continue;
    if (newCardLastFours.has(lastFour)) continue; // already handled above

    let autoUserId: string | null = null;
    if (alias) {
      const [matchedUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.name, alias))
        .limit(1);
      if (matchedUser) autoUserId = matchedUser.id;
    }
    await upsertCardMapping({
      cardLastFour: lastFour,
      cardAlias: alias ?? null,
      userId: autoUserId,
      companyId: defaultCompanyId,
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
  return tx ?? null;
}
