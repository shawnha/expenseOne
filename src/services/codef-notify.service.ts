/**
 * Codef Notify Service
 *
 * FinanceOne의 financeone.transactions 테이블에서 새 카드 거래를 읽어
 * 매핑된 사용자에게 알림을 보냅니다.
 *
 * FinanceOne이 Codef sync 완료 후 webhook으로 호출합니다.
 */

import { db } from "@/lib/db";
import { gowidCardMappings, gowidTransactions, expenses } from "@/lib/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { createNotification } from "./notification.service";
import { sendPushToUser } from "./push.service";

// ---------------------------------------------------------------------------
// Read new card transactions from financeone.transactions
// ---------------------------------------------------------------------------

interface FinanceOneTransaction {
  id: number;
  date: string;
  amount: number;
  counterparty: string | null;
  card_number: string | null;
  source_type: string;
  is_cancel: boolean;
}

async function fetchNewCodefTransactions(
  sinceDate: string,
): Promise<FinanceOneTransaction[]> {
  // Direct SQL query to financeone schema (same DB)
  const result = await db.execute(sql`
    SELECT id, date::text, amount::integer, counterparty, card_number, source_type, is_cancel
    FROM financeone.transactions
    WHERE source_type IN ('codef_woori_card', 'codef_shinhan_card')
      AND date >= ${sinceDate}::date
      AND is_cancel = false
      AND is_duplicate = false
    ORDER BY date DESC, id DESC
  `);

  return result as unknown as FinanceOneTransaction[];
}

// ---------------------------------------------------------------------------
// Check if user already submitted an expense for this transaction
// ---------------------------------------------------------------------------

async function hasExistingExpense(
  userId: string,
  amount: number,
  date: string,
  cardLastFour: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM expenseone.expenses
    WHERE submitted_by_id = ${userId}
      AND type = 'CORPORATE_CARD'
      AND amount = ${amount}
      AND transaction_date BETWEEN (${date}::date - INTERVAL '1 day') AND (${date}::date + INTERVAL '1 day')
      AND status != 'CANCELLED'
    LIMIT 1
  `);
  return ((result as unknown as unknown[]).length) > 0;
}

// ---------------------------------------------------------------------------
// Main: process new Codef transactions and notify users
// ---------------------------------------------------------------------------

export async function processCodefNotifications(): Promise<{
  checked: number;
  notified: number;
  skippedDuplicate: number;
  skippedNoMapping: number;
}> {
  // Fetch transactions from last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sinceDate = sevenDaysAgo.toISOString().slice(0, 10);

  const transactions = await fetchNewCodefTransactions(sinceDate);

  if (transactions.length === 0) {
    return { checked: 0, notified: 0, skippedDuplicate: 0, skippedNoMapping: 0 };
  }

  // Get all card mappings
  const mappings = await db
    .select()
    .from(gowidCardMappings)
    .where(eq(gowidCardMappings.isActive, true));

  // Build lookup: last3 digits → mapping (for Codef masked cards)
  const cardLookup = new Map<string, typeof mappings[0]>();
  for (const m of mappings) {
    if (m.userId) {
      // Store by last 3 digits (Codef shows *XXX for lotte)
      const last3 = m.cardLastFour.slice(-3);
      cardLookup.set(last3, m);
      // Also store full 4 digits (for woori card which shows full last 4)
      cardLookup.set(m.cardLastFour, m);
    }
  }

  // Check which FinanceOne transaction IDs we've already processed
  const finTxIds = transactions.map((t) => t.id);
  const existingRows = await db
    .select({ gowidExpenseId: gowidTransactions.gowidExpenseId })
    .from(gowidTransactions)
    .where(inArray(gowidTransactions.gowidExpenseId, finTxIds));
  const existingSet = new Set(existingRows.map((r) => r.gowidExpenseId));

  let notified = 0;
  let skippedDuplicate = 0;
  let skippedNoMapping = 0;

  for (const tx of transactions) {
    if (existingSet.has(tx.id)) continue;

    // Extract card last digits
    const cardNum = tx.card_number ?? "";
    const cleanCard = cardNum.replace(/\*/g, "");
    const last3 = cleanCard.slice(-3);
    const last4 = cleanCard.slice(-4);

    // Find mapping
    const mapping = cardLookup.get(last4) ?? cardLookup.get(last3);
    if (!mapping?.userId) {
      skippedNoMapping++;
      continue;
    }

    // Check if user already submitted this expense
    const alreadySubmitted = await hasExistingExpense(
      mapping.userId,
      tx.amount,
      tx.date,
      mapping.cardLastFour,
    );

    // Stage the transaction (to prevent re-notification)
    const [inserted] = await db.insert(gowidTransactions).values({
      gowidExpenseId: tx.id, // reuse this field for financeone.transactions.id
      userId: mapping.userId,
      cardLastFour: mapping.cardLastFour,
      cardAlias: mapping.cardAlias,
      expenseDate: tx.date.replace(/-/g, ""),
      expenseTime: null,
      amount: tx.amount,
      currency: "KRW",
      storeName: tx.counterparty,
      storeAddress: null,
      status: alreadySubmitted ? "consumed" : "pending",
    }).onConflictDoNothing().returning();

    if (!inserted) continue; // already exists

    if (alreadySubmitted) {
      skippedDuplicate++;
      continue;
    }

    // Send notification
    const amountStr = tx.amount.toLocaleString();
    const storeName = tx.counterparty ?? "카드 결제";
    await createNotification({
      recipientId: mapping.userId,
      type: "GOWID_NEW_TRANSACTION",
      title: "법카 사용 내역 등록해주세요",
      message: `${storeName} ${amountStr}원 — 비용으로 등록해주세요.`,
      linkUrl: `/expenses/new/corporate-card?gowidTxId=${inserted.id}`,
    });

    await db
      .update(gowidTransactions)
      .set({ notifiedAt: new Date() })
      .where(eq(gowidTransactions.id, inserted.id));

    sendPushToUser(
      mapping.userId,
      "법카 사용 내역 등록해주세요",
      `${storeName} ${amountStr}원`,
      `/expenses/new/corporate-card?gowidTxId=${inserted.id}`,
    ).catch((err) => console.error("[Push] Codef 알림 실패:", err));

    notified++;
  }

  return {
    checked: transactions.length,
    notified,
    skippedDuplicate,
    skippedNoMapping,
  };
}
