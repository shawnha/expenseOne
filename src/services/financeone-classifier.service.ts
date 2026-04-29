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

  // L2 added in Task 4
  return null;
}
