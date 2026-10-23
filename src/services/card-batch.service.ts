/**
 * 법카 결제 여러 건 한 번에 올리기(출장 등).
 *
 * - 목록: 내 카드의 아직 안 올린 고위드 결제(status = 'pending')만. 남의 결제·이미 올린 결제는 안 보인다.
 * - 올리기: 금액·가맹점·날짜는 **고위드 거래에서 서버가 읽는다** — 화면은 어느 거래인지와 제목·카테고리·회사만 보낸다.
 *   한 건씩: 거래를 먼저 잡고(pending → consumed, 조건부 UPDATE 라 두 번 눌러도 한 번만 잡힌다) → 비용을 만들고
 *   → 잡은 거래에 비용 id 를 단다. 비용을 못 만들면 거래를 pending 으로 되돌린다.
 * - 비용 생성은 한 건씩 올릴 때와 같은 createExpense 를 쓴다(슬랙 게시 포함 — 건수만큼 올라간다).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses, gowidTransactions } from "@/lib/db/schema";
import { createExpenseSchema } from "@/lib/validations/expense";
import { createExpense } from "@/services/expense.service";
import { AppError } from "@/services/attachment.service";
import {
  CARD_BATCH_MAX,
  type CardBatchItemResult,
  type CardBatchRequest,
  type CardBatchResponse,
  type PendingCardTx,
  type PendingCardTxList,
} from "@/lib/card-batch/types";

const LIST_LIMIT = 200;

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (Array.isArray(r) ? (r as Row[]) : ((r as { rows?: Row[] })?.rows ?? []));

/** "20261026" → "2026-10-26" */
function compactToIso(d: string): string {
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

/** "143005" → "14:30" */
function compactToTime(t: string | null): string | null {
  return t && /^\d{4,6}$/.test(t) ? `${t.slice(0, 2)}:${t.slice(2, 4)}` : null;
}

/**
 * 기간(YYYY-MM-DD, 포함) 안의 내 미처리 법카 결제. 같은 날짜(±2일)에 같은 금액이나 같은 가맹점으로
 * 이미 올린 법카 비용이 있으면 possibleDuplicate — 예: 해외 결제를 달러로 직접 올린 경우(금액이 달라 자동으로
 * 짝지어지지 않아 pending 으로 남는다).
 */
export async function listPendingCardTransactions(
  userId: string,
  from: string,
  to: string,
  /** 관리자 전용: 주인이 연결되지 않은 카드(공용 카드 등)의 결제. cardLastFour 로 좁힐 수 있다 */
  options: { unassigned?: boolean; cardLastFour?: string | null } = {},
): Promise<PendingCardTxList> {
  const fromCompact = from.replaceAll("-", "");
  const toCompact = to.replaceAll("-", "");
  const owner = options.unassigned ? sql`g.user_id IS NULL` : sql`g.user_id = ${userId}::uuid`;
  const card = options.cardLastFour ? sql`AND g.card_last_four = ${options.cardLastFour}` : sql``;
  // 공용 카드는 카드에 연결된 회사만 본다(사람이 없으니 user_id 로 좁히지 않는다)
  const mappingOwner = options.unassigned ? sql`cm.user_id IS NULL` : sql`cm.user_id = g.user_id`;
  const rows = rowsOf(
    await db.execute(sql`
      SELECT g.id, g.expense_date, g.expense_time, g.amount, g.currency, g.store_name, g.card_last_four,
             m.company_id AS mapped_company_id,
             EXISTS (
               SELECT 1 FROM expenseone.expenses e
                WHERE e.submitted_by_id = ${userId}::uuid
                  AND e.type = 'CORPORATE_CARD' AND e.status <> 'CANCELLED'
                  AND e.transaction_date BETWEEN to_date(g.expense_date, 'YYYYMMDD') - 2
                                             AND to_date(g.expense_date, 'YYYYMMDD') + 2
                  AND (e.amount = g.amount
                       OR (g.store_name IS NOT NULL AND e.merchant_name IS NOT NULL
                           AND lower(trim(e.merchant_name)) = lower(trim(g.store_name))))
                  AND NOT EXISTS (SELECT 1 FROM expenseone.gowid_transactions g2
                                   WHERE g2.consumed_expense_id = e.id)
             ) AS possible_duplicate
        FROM expenseone.gowid_transactions g
        LEFT JOIN LATERAL (
          SELECT cm.company_id FROM expenseone.gowid_card_mappings cm
           WHERE cm.card_last_four = g.card_last_four AND ${mappingOwner}
           LIMIT 1
        ) m ON TRUE
       WHERE ${owner}
         AND g.status = 'pending'
         AND g.expense_date BETWEEN ${fromCompact} AND ${toCompact}
         ${card}
       ORDER BY g.expense_date, g.expense_time NULLS LAST, g.id
       LIMIT ${LIST_LIMIT + 1}
    `),
  );
  const items: PendingCardTx[] = rows.slice(0, LIST_LIMIT).map((r) => ({
    id: String(r.id),
    date: compactToIso(String(r.expense_date)),
    time: compactToTime((r.expense_time as string | null) ?? null),
    amount: Number(r.amount),
    currency: String(r.currency ?? "KRW"),
    storeName: (r.store_name as string | null) ?? null,
    cardLastFour: (r.card_last_four as string | null) ?? null,
    mappedCompanyId: (r.mapped_company_id as string | null) ?? null,
    possibleDuplicate: r.possible_duplicate === true,
  }));
  return { items, truncated: rows.length > LIST_LIMIT };
}

export interface BatchUser {
  id: string;
  name: string;
  email: string;
  companyId: string | null;
  role: "MEMBER" | "ADMIN";
}

/**
 * 거래를 잡는다 — 아직 pending 이고, 내 카드 결제이거나(관리자라면) 주인 없는 카드 결제일 때만. 못 잡으면 null.
 * 주인 없는 카드 결제를 관리자가 올리면 그 거래의 주인을 그 관리자로 남긴다(누가 올렸는지 추적).
 */
async function claimTransaction(txId: string, user: BatchUser) {
  const ownerCond =
    user.role === "ADMIN"
      ? sql`(${gowidTransactions.userId} = ${user.id}::uuid OR ${gowidTransactions.userId} IS NULL)`
      : eq(gowidTransactions.userId, user.id);
  const [tx] = await db
    .update(gowidTransactions)
    .set({ status: "consumed", consumedAt: new Date(), updatedAt: new Date(), userId: user.id })
    .where(and(eq(gowidTransactions.id, txId), ownerCond, eq(gowidTransactions.status, "pending")))
    .returning();
  return tx ?? null;
}

/** 비용을 못 만들었을 때 잡은 거래를 되돌린다(주인이 원래 없었으면 다시 비운다) */
async function releaseTransaction(txId: string, originalUserId: string | null) {
  await db
    .update(gowidTransactions)
    .set({ status: "pending", consumedAt: null, consumedExpenseId: null, userId: originalUserId, updatedAt: new Date() })
    .where(and(eq(gowidTransactions.id, txId), sql`${gowidTransactions.consumedExpenseId} IS NULL`));
}

export async function createCardBatch(user: BatchUser, req: CardBatchRequest): Promise<CardBatchResponse> {
  const ids = req.items.map((i) => i.gowidTxId);
  if (req.items.length === 0 || req.items.length > CARD_BATCH_MAX) {
    throw new AppError("VALIDATION_ERROR", `한 번에 1~${CARD_BATCH_MAX}건까지 올릴 수 있습니다.`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new AppError("VALIDATION_ERROR", "같은 결제가 두 번 들어 있습니다.");
  }

  const results: CardBatchItemResult[] = [];
  // 한 건씩 — 슬랙 게시가 한꺼번에 몰리지 않게, 그리고 한 건 실패가 다른 건을 막지 않게.
  for (const item of req.items) {
    const [before] = await db
      .select({ userId: gowidTransactions.userId })
      .from(gowidTransactions)
      .where(eq(gowidTransactions.id, item.gowidTxId))
      .limit(1);
    const tx = before ? await claimTransaction(item.gowidTxId, user) : null;
    if (!tx) {
      results.push({ gowidTxId: item.gowidTxId, ok: false, message: "이미 올라갔거나 찾을 수 없는 결제입니다." });
      continue;
    }

    const foreign = tx.currency && tx.currency !== "KRW";
    const note = item.description?.trim() || null;
    const parsed = createExpenseSchema.safeParse({
      type: "CORPORATE_CARD",
      title: item.title.trim(),
      description: foreign ? [`해외 결제 (${tx.currency})`, note].filter(Boolean).join("\n") : note,
      // 금액은 언제나 카드사가 원화로 청구한 고위드 금액. 회사 통화가 달러여도 원화로 넣는다(아래 currency).
      amount: tx.amount,
      currency: "KRW",
      category: req.category,
      transactionDate: compactToIso(tx.expenseDate),
      companyId: req.companyId,
      merchantName: (tx.storeName ?? "").slice(0, 200),
      isUrgent: false,
    });
    if (!parsed.success || parsed.data.type !== "CORPORATE_CARD") {
      await releaseTransaction(tx.id, before?.userId ?? null);
      const message = parsed.success ? "올릴 수 없는 결제입니다." : parsed.error.issues.map((i) => i.message).join(", ");
      results.push({ gowidTxId: tx.id, ok: false, message });
      continue;
    }

    try {
      const expense = await createExpense(parsed.data, user.id, user.name, user.email, user.companyId);
      await db
        .update(gowidTransactions)
        .set({ consumedExpenseId: expense.id, updatedAt: new Date() })
        .where(eq(gowidTransactions.id, tx.id));
      // 카드 끝자리는 createExpense 가 프로필 카드로 채운다 — 실제로 결제한 카드로 맞춘다(공용 카드·카드 여러 장)
      if (tx.cardLastFour) {
        await db.update(expenses).set({ cardLastFour: tx.cardLastFour }).where(eq(expenses.id, expense.id));
      }
      results.push({ gowidTxId: tx.id, ok: true, expenseId: expense.id });
    } catch (err) {
      await releaseTransaction(tx.id, before?.userId ?? null);
      const message = err instanceof AppError ? err.message : "올리지 못했습니다. 잠시 후 다시 시도해주세요.";
      if (!(err instanceof AppError)) console.error("[card-batch] create failed:", err instanceof Error ? err.name : "unknown");
      results.push({ gowidTxId: tx.id, ok: false, message });
    }
  }

  const created = results.filter((r) => r.ok).length;
  return { created, failed: results.length - created, results };
}
