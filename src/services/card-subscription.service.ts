import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { rowsOf, num } from "@/lib/plans/rows";
import { subscriptionKeyOf } from "@/lib/card-subscription";
import { AppError } from "@/services/attachment.service";

// ---------------------------------------------------------------------------
// 법카 정기 결제 (0031)
//
// 법카 폼의 「정기 결제」 체크 → 이 비용을 (작성자 × 가맹점) 정기 결제 한 줄에 묶는다.
// 목록은 「반복 지급」 화면 아래에 나온다. 본인 것만, 관리자는 전원 것.
//
// 비용계획·반복 지급(recurring_expenses)·알림과 무관하다 — 여기서는 표시와 목록만 한다.
// 다음 달 고위드 결제를 알아보는 일(2단계)은 아직 없다. 그때도 merchant_key 로 찾는다.
// ---------------------------------------------------------------------------

export interface SubscriptionActor {
  id: string;
  role: string;
}

/** 정기 결제로 셀 수 있는 비용 상태 — 취소·반려된 결제는 목록 계산에서 뺀다. */
const LIVE = sql`e.status NOT IN ('CANCELLED', 'REJECTED')`;

/**
 * 이 법카 비용을 정기 결제로 표시한다. 같은 사람·같은 가맹점의 정기 결제가 있으면 거기에 붙이고
 * (해지해 둔 것이면 다시 켠다), 없으면 만든다. 제목·카테고리·법인은 이번 결제 것으로 새로 적는다.
 * 작성자 또는 관리자만. 이미 표시돼 있으면 그대로 둔다.
 */
export async function markCardSubscription(actor: SubscriptionActor, expenseId: string): Promise<{ subscriptionId: string }> {
  return db.transaction(async (tx) => {
    const exp = rowsOf<{
      id: string;
      type: string;
      submitted_by_id: string;
      merchant_name: string | null;
      title: string;
      category: string;
      company_id: string;
    }>(
      await tx.execute(sql`SELECT id, type, submitted_by_id, merchant_name, title, category, company_id
                             FROM expenseone.expenses WHERE id = ${expenseId}::uuid`),
    )[0];
    if (!exp) throw new AppError("NOT_FOUND", "비용을 찾을 수 없습니다.");
    if (exp.type !== "CORPORATE_CARD") throw new AppError("VALIDATION_ERROR", "정기 결제는 법카 사용 건만 표시할 수 있습니다.");
    if (actor.role !== "ADMIN" && exp.submitted_by_id !== actor.id) {
      throw new AppError("FORBIDDEN", "본인이 올린 법카만 정기 결제로 표시할 수 있습니다.");
    }
    const key = subscriptionKeyOf(exp.merchant_name);
    if (!key) throw new AppError("VALIDATION_ERROR", "가맹점이 있어야 정기 결제로 표시할 수 있습니다.");

    const sub = rowsOf<{ id: string }>(
      await tx.execute(sql`INSERT INTO expenseone.card_subscriptions
                             (owner_id, company_id, merchant_key, merchant_name, title, category)
                           VALUES (${exp.submitted_by_id}::uuid, ${exp.company_id}::uuid, ${key},
                                   ${exp.merchant_name!.trim()}, ${exp.title}, ${exp.category})
                           ON CONFLICT (owner_id, merchant_key) DO UPDATE
                             SET company_id = EXCLUDED.company_id,
                                 merchant_name = EXCLUDED.merchant_name,
                                 title = EXCLUDED.title,
                                 category = EXCLUDED.category,
                                 is_active = true,
                                 updated_at = now()
                           RETURNING id`),
    )[0];

    await tx.execute(sql`INSERT INTO expenseone.card_subscription_charges (expense_id, subscription_id)
                         VALUES (${exp.id}::uuid, ${sub.id}::uuid)
                         ON CONFLICT (expense_id) DO UPDATE SET subscription_id = EXCLUDED.subscription_id`);
    return { subscriptionId: sub.id };
  });
}

/** 이 비용의 정기 결제 표시를 뗀다(정기 결제 줄은 남는다). 작성자 또는 관리자만. */
export async function unmarkCardSubscription(actor: SubscriptionActor, expenseId: string): Promise<void> {
  const owner = rowsOf<{ submitted_by_id: string }>(
    await db.execute(sql`SELECT submitted_by_id FROM expenseone.expenses WHERE id = ${expenseId}::uuid`),
  )[0];
  if (!owner) throw new AppError("NOT_FOUND", "비용을 찾을 수 없습니다.");
  if (actor.role !== "ADMIN" && owner.submitted_by_id !== actor.id) {
    throw new AppError("FORBIDDEN", "본인이 올린 법카만 고칠 수 있습니다.");
  }
  await db.execute(sql`DELETE FROM expenseone.card_subscription_charges WHERE expense_id = ${expenseId}::uuid`);
}

/** 이 비용이 정기 결제로 표시돼 있으면 그 정기 결제 제목. 표가 아직 없으면(0031 전) null. */
export async function getExpenseSubscriptionTitle(expenseId: string): Promise<string | null> {
  try {
    const row = rowsOf<{ title: string }>(
      await db.execute(sql`SELECT s.title FROM expenseone.card_subscription_charges c
                             JOIN expenseone.card_subscriptions s ON s.id = c.subscription_id
                            WHERE c.expense_id = ${expenseId}::uuid`),
    )[0];
    return row?.title ?? null;
  } catch {
    return null;
  }
}

/** 켜 두거나 해지 표시. 그 정기 결제의 주인 또는 관리자만. */
export async function setCardSubscriptionActive(
  actor: SubscriptionActor,
  subscriptionId: string,
  active: boolean,
): Promise<void> {
  const row = rowsOf<{ owner_id: string }>(
    await db.execute(sql`SELECT owner_id FROM expenseone.card_subscriptions WHERE id = ${subscriptionId}::uuid`),
  )[0];
  if (!row) throw new AppError("NOT_FOUND", "정기 결제를 찾을 수 없습니다.");
  if (actor.role !== "ADMIN" && row.owner_id !== actor.id) {
    throw new AppError("FORBIDDEN", "본인 정기 결제만 바꿀 수 있습니다.");
  }
  await db.execute(sql`UPDATE expenseone.card_subscriptions
                          SET is_active = ${active}, updated_at = now()
                        WHERE id = ${subscriptionId}::uuid`);
}

export interface CardSubscriptionRow {
  id: string;
  ownerId: string;
  ownerName: string | null;
  companyName: string | null;
  merchantName: string;
  title: string;
  category: string | null;
  isActive: boolean;
  /** 살아 있는(취소·반려 아닌) 결제 수 */
  chargeCount: number;
  /** 마지막 결제의 거래일 yyyy-mm-dd */
  lastChargeDate: string | null;
  /** 마지막 결제 금액(원 환산) */
  lastAmount: number | null;
  /** 마지막 결제 통화와 원래 금액(외화면 센트 등 원 단위 아님 — amount_original 그대로) */
  lastCurrency: string | null;
  lastAmountOriginal: number | null;
  lastExpenseId: string | null;
}

/** 내 정기 결제 목록(관리자는 전원). 켜진 것 먼저, 그다음 최근 결제 순. 표가 아직 없으면 빈 목록. */
export async function listCardSubscriptions(actor: SubscriptionActor): Promise<CardSubscriptionRow[]> {
  const scope = actor.role === "ADMIN" ? sql`true` : sql`s.owner_id = ${actor.id}::uuid`;
  let raw: Array<Record<string, unknown>>;
  try {
    raw = rowsOf<Record<string, unknown>>(
      await db.execute(sql`
        SELECT s.id, s.owner_id, u.name AS owner_name, co.name AS company_name,
               s.merchant_name, s.title, s.category, s.is_active,
               (SELECT count(*) FROM expenseone.card_subscription_charges c
                  JOIN expenseone.expenses e ON e.id = c.expense_id
                 WHERE c.subscription_id = s.id AND ${LIVE}) AS charge_count,
               last.id AS last_expense_id, last.transaction_date AS last_charge_date,
               last.amount AS last_amount, last.currency AS last_currency,
               last.amount_original AS last_amount_original
          FROM expenseone.card_subscriptions s
          LEFT JOIN expenseone.users u ON u.id = s.owner_id
          LEFT JOIN expenseone.companies co ON co.id = s.company_id
          LEFT JOIN LATERAL (
            SELECT e.id, e.transaction_date::text AS transaction_date, e.amount, e.currency, e.amount_original
              FROM expenseone.card_subscription_charges c
              JOIN expenseone.expenses e ON e.id = c.expense_id
             WHERE c.subscription_id = s.id AND ${LIVE}
             ORDER BY e.transaction_date DESC, e.created_at DESC
             LIMIT 1
          ) last ON true
         WHERE ${scope}
         ORDER BY s.is_active DESC, last.transaction_date DESC NULLS LAST, s.created_at DESC`),
    );
  } catch (err) {
    // 0031 적용 전 배포여도 반복 지급 화면이 깨지지 않게 한다.
    console.error("[CardSubscription] list failed:", err instanceof Error ? err.message : "unknown");
    return [];
  }
  return raw.map((r) => ({
    id: String(r.id),
    ownerId: String(r.owner_id),
    ownerName: (r.owner_name as string | null) ?? null,
    companyName: (r.company_name as string | null) ?? null,
    merchantName: String(r.merchant_name),
    title: String(r.title),
    category: (r.category as string | null) ?? null,
    isActive: r.is_active === true,
    chargeCount: num(r.charge_count),
    lastChargeDate: (r.last_charge_date as string | null) ?? null,
    lastAmount: r.last_amount == null ? null : num(r.last_amount),
    lastCurrency: (r.last_currency as string | null) ?? null,
    lastAmountOriginal: r.last_amount_original == null ? null : num(r.last_amount_original),
    lastExpenseId: (r.last_expense_id as string | null) ?? null,
  }));
}

/** 법카 폼이 「정기 결제」를 미리 켜 둘 가맹점 키 — 본인의 켜진 정기 결제만. 표가 없으면 빈 목록. */
export async function getMyActiveSubscriptionKeys(userId: string): Promise<string[]> {
  try {
    return rowsOf<{ merchant_key: string }>(
      await db.execute(sql`SELECT merchant_key FROM expenseone.card_subscriptions
                            WHERE owner_id = ${userId}::uuid AND is_active = true`),
    ).map((r) => r.merchant_key);
  } catch {
    return [];
  }
}
