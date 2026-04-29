/**
 * FinanceOne meal-classifier.
 *
 * Decides whether a card transaction's merchant is a 식비 leaf account
 * by consulting two FinanceOne tables:
 *   L1: mapping_rules (counterparty pattern → internal_account)
 *   L2: transactions  (history-majority of confirmed/manual mappings)
 *
 * Returns null when no confident meal match — caller should fall back to
 * the normal notification flow.
 */

import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { MEAL_LEAF_CODES } from "@/lib/financeone/meal-accounts";

export interface MealClassification {
  internalAccountId: number;
  accountCode: string;
  accountName: string;
  source: "mapping_rules" | "history_majority";
}

type MappingRuleHit = {
  internal_account_id: number;
  code: string;
  name: string;
  is_meal: boolean;
} & Record<string, unknown>;

/**
 * L1: financeone.mapping_rules direct match (exact then trigram ≥ 0.5).
 * Returns the best-scoring rule whose mapped account is a meal leaf, or null.
 */
async function matchByMappingRules(
  storeName: string,
  entityId: number,
): Promise<MealClassification | null> {
  if (!storeName.trim()) return null;

  const codes = Array.from(MEAL_LEAF_CODES);
  const result = await db.execute<MappingRuleHit>(sql`
    SELECT
      mr.internal_account_id,
      ia.code,
      ia.name,
      (ia.code = ANY(${codes}::text[])) AS is_meal
    FROM financeone.mapping_rules mr
    JOIN financeone.internal_accounts ia ON ia.id = mr.internal_account_id
    WHERE mr.entity_id = ${entityId}
      AND (
        mr.counterparty_pattern = ${storeName}
        OR similarity(mr.counterparty_pattern, ${storeName}) >= 0.5
      )
    ORDER BY
      (mr.counterparty_pattern = ${storeName}) DESC,
      similarity(mr.counterparty_pattern, ${storeName}) DESC,
      mr.confidence DESC,
      mr.hit_count DESC
    LIMIT 1
  `);

  const rows = result as unknown as MappingRuleHit[];
  const top = rows[0];
  if (!top || !top.is_meal) return null;

  return {
    internalAccountId: top.internal_account_id,
    accountCode: top.code,
    accountName: top.name,
    source: "mapping_rules",
  };
}

type HistoryRow = {
  internal_account_id: number;
  code: string;
  name: string;
  uses: number;
  is_meal: boolean;
} & Record<string, unknown>;

const HISTORY_MIN_TX = 3;
const HISTORY_MEAL_RATIO = 0.8;

/**
 * L2: financeone.transactions history majority.
 * Considers only confirmed/manual/exact mappings (high-trust signals).
 * Returns a meal classification when the majority of past transactions
 * for this counterparty mapped to a meal leaf account.
 */
async function matchByHistoryMajority(
  storeName: string,
  entityId: number,
): Promise<MealClassification | null> {
  const codes = Array.from(MEAL_LEAF_CODES);
  const result = await db.execute<HistoryRow>(sql`
    SELECT
      t.internal_account_id,
      ia.code,
      ia.name,
      count(*)::int AS uses,
      (ia.code = ANY(${codes}::text[])) AS is_meal
    FROM financeone.transactions t
    JOIN financeone.internal_accounts ia ON ia.id = t.internal_account_id
    WHERE t.entity_id = ${entityId}
      AND t.is_cancel = false
      AND t.is_duplicate = false
      AND t.mapping_source IN ('confirmed', 'manual', 'exact')
      AND t.internal_account_id IS NOT NULL
      AND (
        t.counterparty = ${storeName}
        OR similarity(t.counterparty, ${storeName}) >= 0.5
      )
    GROUP BY t.internal_account_id, ia.code, ia.name
  `);

  const rows = result as unknown as HistoryRow[];
  if (rows.length === 0) return null;

  const totalUses = rows.reduce((sum, r) => sum + r.uses, 0);
  if (totalUses < HISTORY_MIN_TX) return null;

  const mealUses = rows.filter((r) => r.is_meal).reduce((sum, r) => sum + r.uses, 0);
  if (mealUses / totalUses < HISTORY_MEAL_RATIO) return null;

  const topMeal = rows
    .filter((r) => r.is_meal)
    .sort((a, b) => b.uses - a.uses)[0];
  if (!topMeal) return null;

  return {
    internalAccountId: topMeal.internal_account_id,
    accountCode: topMeal.code,
    accountName: topMeal.name,
    source: "history_majority",
  };
}

/**
 * Classify a card-transaction merchant as a meal expense.
 * Returns null when no confident match — caller should run normal flow.
 */
export async function classifyMealExpense(
  storeName: string | null | undefined,
  entityId: number | null,
): Promise<MealClassification | null> {
  if (!storeName || !entityId) return null;
  const trimmed = storeName.trim();
  if (!trimmed) return null;

  const l1 = await matchByMappingRules(trimmed, entityId);
  if (l1) return l1;

  const l2 = await matchByHistoryMajority(trimmed, entityId);
  return l2;
}
