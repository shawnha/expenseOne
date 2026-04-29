# 카드 결제 식비 자동분류 + 알림 스킵 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GoWid/Codef 카드 거래 동기화 시 식비 카테고리(식비/간식커피/점심/약국식비/리테일식비) 가맹점은 FinanceOne 매핑 데이터로 자동 감지해서 APPROVED expense를 자동 생성하고 사용자/Slack 알림을 스킵한다.

**Architecture:** FinanceOne의 `mapping_rules`(L1) → `transactions` 다수결(L2) → fallthrough(L3) 3-layer classifier를 신규 `financeone-classifier.service.ts`로 분리. 기존 `gowid.service.ts`와 `codef-notify.service.ts`의 알림 호출 직전에 classifier로 분기. `expenses` 테이블에 `auto_classified` 메타데이터 3컬럼 추가, admin UI에 뱃지+필터.

**Tech Stack:** Next.js 14 / Drizzle ORM / Supabase Postgres (cross-schema reads from `financeone.*`) / pg_trgm (이미 enabled, GIN index 존재).

**Spec:** `docs/superpowers/specs/2026-04-29-card-meal-auto-classify-design.md`

---

## File Structure

| 파일 | 역할 | 신규/수정 |
|---|---|---|
| `src/lib/financeone/meal-accounts.ts` | 식비 leaf set + COMPANY_TO_ENTITY 매핑 단일 출처 | 신규 |
| `src/services/financeone-classifier.service.ts` | L1/L2 매칭 로직 (`classifyMealExpense`) | 신규 |
| `drizzle/0009_expenses_auto_classified.sql` | DB 마이그레이션 | 신규 |
| `src/lib/db/schema.ts` | `expenses`에 `autoClassified*` 3컬럼 | 수정 |
| `src/services/gowid.service.ts` | 알림 직전 classifier 분기 | 수정 |
| `src/services/codef-notify.service.ts` | 동일 분기 | 수정 |
| `src/lib/validations/expense.ts` | `expenseQuerySchema`에 `autoClassified` 필터 추가 | 수정 |
| `src/services/expense.service.ts` | `getExpenses`에서 `autoClassified` 필터 처리 | 수정 |
| `src/components/expenses/expense-filters.tsx` | "자동분류" 토글 필터 (admin 한정) | 수정 |
| `src/components/expenses/expense-table.tsx` | "자동분류" 뱃지 노출 | 수정 |
| `src/app/(dashboard)/admin/expenses/page.tsx` | 필터 파라미터 처리 | 수정 |

테스트 프레임워크가 없는 프로젝트라서 검증은 (a) `tsc --noEmit` (b) `npm run lint` (c) admin 가짜 fetch / SQL 직접 검증 (d) cron 응답 logging으로 진행한다.

---

## Task 1: 식비 leaf set + entity 매핑 상수

**Files:**
- Create: `src/lib/financeone/meal-accounts.ts`

- [ ] **Step 1: Create constants file**

`src/lib/financeone/meal-accounts.ts`:

```ts
/**
 * 식비 자동분류에 사용되는 FinanceOne 메타데이터.
 *
 * - COMPANY_TO_ENTITY: ExpenseOne 회사 slug → financeone.entities.id
 * - MEAL_LEAF_CODES: 자동분류 대상으로 인정하는 internal_accounts.code 목록
 *   (entity별로 같은 code가 다른 의미일 수 있어 entity_id와 함께 조회한다)
 *
 * 회식(EXP-030-003)은 의도적으로 제외 — 가맹점명이 식당이지만 회식이 아닌
 * 케이스(클라이언트 미팅 등)와의 오분류 위험이 커서 수동 제출 흐름을 유지.
 */

export const COMPANY_TO_ENTITY: Record<string, number> = {
  hoi: 1,
  korea: 2,
  retail: 3,
};

/** 자동분류 대상으로 인정할 internal_accounts.code 화이트리스트. */
export const MEAL_LEAF_CODES: ReadonlySet<string> = new Set([
  "EXP-030-001", // 식비 / 점심
  "EXP-030-002", // 간식/커피
  "EXP-093-001", // 약국식비 (한아원코리아)
  "EXP-094-001", // 리테일식비 (한아원코리아)
]);

export function getEntityIdForCompanySlug(slug: string | null | undefined): number | null {
  if (!slug) return null;
  return COMPANY_TO_ENTITY[slug] ?? null;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS (새 파일은 다른 곳에서 아직 안 씀)

- [ ] **Step 3: Commit**

```bash
git add src/lib/financeone/meal-accounts.ts
git commit -m "feat(financeone): add meal leaf code whitelist + entity mapping"
```

---

## Task 2: DB 마이그레이션 + schema.ts 갱신

**Files:**
- Create: `drizzle/0009_expenses_auto_classified.sql`
- Modify: `src/lib/db/schema.ts:139-181` (expenses 테이블 정의)

- [ ] **Step 1: Write migration SQL**

`drizzle/0009_expenses_auto_classified.sql`:

```sql
-- ---------------------------------------------------------------------------
-- 0009_expenses_auto_classified
-- Adds auto-classification metadata so we can mark expenses created by
-- the FinanceOne classifier (meal/snack auto-detection) and surface them
-- separately in the admin UI.
--
-- - auto_classified           : true when row was created by classifier
-- - auto_classified_source    : 'mapping_rules' | 'history_majority'
-- - auto_classified_account_id: financeone.internal_accounts.id (no FK,
--   cross-schema reference is intentional — lookup only)
-- ---------------------------------------------------------------------------

BEGIN;

SET LOCAL statement_timeout = '60s';

ALTER TABLE expenseone.expenses
  ADD COLUMN IF NOT EXISTS auto_classified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_classified_source varchar(32),
  ADD COLUMN IF NOT EXISTS auto_classified_account_id integer;

CREATE INDEX IF NOT EXISTS idx_expenses_auto_classified
  ON expenseone.expenses (auto_classified)
  WHERE auto_classified = true;

COMMIT;
```

- [ ] **Step 2: Apply migration to dev DB**

```bash
psql "$SUPABASE_DB_URL" -f drizzle/0009_expenses_auto_classified.sql
```

Expected: `BEGIN`, `SET`, `ALTER TABLE`, `CREATE INDEX`, `COMMIT` lines printed without error.

- [ ] **Step 3: Verify columns exist**

```bash
psql "$SUPABASE_DB_URL" -c "\d expenseone.expenses" | grep auto_classified
```

Expected output (3 lines):
```
 auto_classified             | boolean ... | not null | false
 auto_classified_source      | character varying(32) | |
 auto_classified_account_id  | integer | |
```

- [ ] **Step 4: Update schema.ts to match**

In `src/lib/db/schema.ts`, locate the `expenses` table block. After the `slackChannelId` line and before `updatedAt`, insert the three columns:

```ts
    slackChannelId: varchar("slack_channel_id", { length: 50 }),
    autoClassified: boolean("auto_classified").notNull().default(false),
    autoClassifiedSource: varchar("auto_classified_source", { length: 32 }),
    autoClassifiedAccountId: integer("auto_classified_account_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
```

Also ensure `boolean` and `integer` are already imported at the top (they are — `expenses` already uses them).

- [ ] **Step 5: Add index to schema.ts**

In the same `expenses` table block, the `(table) => [ ... ]` array at the bottom defines indexes. Find that array and append (preserving existing entries):

```ts
    index("idx_expenses_auto_classified")
      .on(table.autoClassified)
      .where(sql`auto_classified = true`),
```

If `index` and `sql` aren't yet imported in this file, add them to the existing drizzle-orm imports. Verify by checking line ~1 of `schema.ts`.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add drizzle/0009_expenses_auto_classified.sql src/lib/db/schema.ts
git commit -m "feat(db): add auto_classified columns to expenses (migration 0009)"
```

---

## Task 3: Classifier service — L1 (mapping_rules)

**Files:**
- Create: `src/services/financeone-classifier.service.ts`

- [ ] **Step 1: Create classifier file with L1 only**

`src/services/financeone-classifier.service.ts`:

```ts
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

interface MappingRuleHit {
  internal_account_id: number;
  code: string;
  name: string;
  is_meal: boolean;
}

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
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 3: Smoke-verify L1 against real FinanceOne data**

Check that mapping_rules + entity 2 (한아원코리아) matches expected meal merchants. Run against the live DB:

```bash
psql "$SUPABASE_DB_URL" -c "
  SELECT mr.counterparty_pattern, ia.code, ia.name
  FROM financeone.mapping_rules mr
  JOIN financeone.internal_accounts ia ON ia.id = mr.internal_account_id
  WHERE mr.entity_id = 2
    AND ia.code IN ('EXP-030-001','EXP-030-002','EXP-093-001','EXP-094-001')
  ORDER BY mr.hit_count DESC
  LIMIT 10;"
```

Expected: at least 5 rows, including 쿠팡이츠 / 우아한형제들 / 메가커피 류 가맹점이 EXP-030-001 또는 EXP-030-002에 매핑.

(이 단계는 코드 변경 없음 — 데이터 sanity check.)

- [ ] **Step 4: Commit**

```bash
git add src/services/financeone-classifier.service.ts
git commit -m "feat(classifier): add L1 mapping_rules meal classifier"
```

---

## Task 4: Classifier service — L2 (history majority)

**Files:**
- Modify: `src/services/financeone-classifier.service.ts`

- [ ] **Step 1: Add L2 query function**

In `src/services/financeone-classifier.service.ts`, before `classifyMealExpense`, add:

```ts
interface HistoryRow {
  internal_account_id: number;
  code: string;
  name: string;
  uses: number;
  is_meal: boolean;
}

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

  // Pick the meal account with the highest uses
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
```

- [ ] **Step 2: Wire L2 into `classifyMealExpense`**

Replace the `// L2 added in Task 4 / return null` lines at the bottom of `classifyMealExpense` with:

```ts
  const l2 = await matchByHistoryMajority(trimmed, entityId);
  return l2;
```

So the full bottom of `classifyMealExpense` reads:

```ts
  const l1 = await matchByMappingRules(trimmed, entityId);
  if (l1) return l1;

  const l2 = await matchByHistoryMajority(trimmed, entityId);
  return l2;
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Smoke-verify L2 against live data**

```bash
psql "$SUPABASE_DB_URL" -c "
  SELECT t.counterparty,
         count(*) FILTER (WHERE ia.code IN ('EXP-030-001','EXP-030-002','EXP-093-001','EXP-094-001')) AS meal_uses,
         count(*) AS total_uses
  FROM financeone.transactions t
  JOIN financeone.internal_accounts ia ON ia.id = t.internal_account_id
  WHERE t.entity_id = 2
    AND t.is_cancel = false
    AND t.is_duplicate = false
    AND t.mapping_source IN ('confirmed','manual','exact')
  GROUP BY t.counterparty
  HAVING count(*) >= 3
  ORDER BY meal_uses DESC
  LIMIT 10;"
```

Expected: top rows are 쿠팡이츠 / 우아한형제들 / 메가커피 등으로 meal_uses ≈ total_uses 이고 명백히 식비 가맹점.

- [ ] **Step 5: Commit**

```bash
git add src/services/financeone-classifier.service.ts
git commit -m "feat(classifier): add L2 history-majority fallback"
```

---

## Task 5: GoWid sync에 classifier 통합

**Files:**
- Modify: `src/services/gowid.service.ts:206-228` (notification block)

- [ ] **Step 1: Read current notification block**

Open `src/services/gowid.service.ts` and find the block from line ~206 (after the `if (alreadyExists)` consume-marker). The relevant region is roughly lines 206-228 — `createNotification` call, `notifiedAt` update, and `sendPushToUser`.

Above this, the loop already has `mapping`, `inserted` (gowid_transactions row), `expense` (GoWid item), `lastFour`, `expenseDateStr`, `amountStr`. It also has `slugToId` mapping company slug → companyId (set on `config.companyId` earlier in the function).

We need:
- `entityId` from the company that this GoWid config came from
- `companyId` from `config.companyId` (already set on the inserted row's userId via mapping)

The cleanest hook is to compute classification right after the duplicate-check (`if (alreadyExists)` block) and branch.

- [ ] **Step 2: Add imports at top of gowid.service.ts**

In `src/services/gowid.service.ts`, add to the existing imports near the top:

```ts
import { classifyMealExpense } from "./financeone-classifier.service";
import { COMPANY_TO_ENTITY } from "@/lib/financeone/meal-accounts";
```

Also ensure `expenses` (table) and `companies` (already imported) are imported. Check line ~7 — `expenses` is already imported.

- [ ] **Step 3: Add classifier branch**

After the `if (alreadyExists) { ... continue; }` block, before the `const amountStr = ...` line, insert:

```ts
      // ---------------------------------------------------------------
      // Meal auto-classification (식비/간식커피/약국식비/리테일식비 자동 처리)
      // ---------------------------------------------------------------
      // Resolve entity for this GoWid config's company. Configs use
      // companySlug at the top of this function.
      const companySlug = configs.find((c) => c.apiKey && c.companyId === mapping.companyId)?.companySlug;
      const entityId = companySlug ? (COMPANY_TO_ENTITY[companySlug] ?? null) : null;

      const mealMatch = await classifyMealExpense(expense.storeName, entityId);

      if (mealMatch) {
        // Auto-create APPROVED expense, mark gowid tx consumed, skip notification.
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
            companyId: mapping.companyId!,
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

        // Counter — caller logs from return value
        // (notified count is for user notifications; auto-classified is its own bucket)
        autoClassifiedCount++;
        continue; // skip the createNotification / sendPushToUser block below
      }
      // ---------------------------------------------------------------
```

- [ ] **Step 4: Wire counter into return value**

Near the start of `syncGowidTransactions`, find where `let newStaged = 0; let notified = 0;` is declared (line ~146). Add:

```ts
  let newStaged = 0;
  let notified = 0;
  let autoClassifiedCount = 0;
```

And update the return type + value at the end of the function (line ~300):

```ts
  return { fetched: allExpenses.length, newStaged, notified, autoClassified: autoClassifiedCount };
```

Also update the function's return-type annotation at line ~84:

```ts
export async function syncGowidTransactions(): Promise<{
  fetched: number;
  newStaged: number;
  notified: number;
  autoClassified: number;
}> {
```

And update the early-return on no configs (line ~91):

```ts
  if (configs.length === 0) {
    return { fetched: 0, newStaged: 0, notified: 0, autoClassified: 0 };
  }
```

And the no-expenses early-return (line ~117):

```ts
  if (allExpenses.length === 0) {
    return { fetched: 0, newStaged: 0, notified: 0, autoClassified: 0 };
  }
```

- [ ] **Step 5: Update cron route logging**

Open `src/app/api/cron/gowid-sync/route.ts`. Find where the result of `syncGowidTransactions()` is returned/logged and ensure `autoClassified` is included in the JSON response. If it currently does `return Response.json(result)` or similar, no changes needed (the field is automatically included).

If it does explicit field projection like `return Response.json({ fetched: result.fetched, ... })`, add `autoClassified: result.autoClassified` to the projection.

```bash
grep -n "syncGowidTransactions\|autoClassified" src/app/api/cron/gowid-sync/route.ts
```

Inspect the output and adjust if needed.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS. If `mapping.companyId` errors as possibly null, narrow:

```ts
if (!mapping.companyId) {
  // can't auto-classify without companyId, fall through to notification
} else {
  // ... classifier branch above
}
```

Wrap the entire mealMatch branch in this guard. (If `mapping.companyId` is already typed non-null in this scope, no change needed.)

- [ ] **Step 7: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/services/gowid.service.ts src/app/api/cron/gowid-sync/route.ts
git commit -m "feat(gowid): skip notification for auto-classified meal transactions"
```

---

## Task 6: Codef-notify에 classifier 통합

**Files:**
- Modify: `src/services/codef-notify.service.ts:140-200`

- [ ] **Step 1: Add imports**

At the top of `src/services/codef-notify.service.ts`, modify the existing schema import to include `expenses` and `companies`:

```ts
// before:
import { gowidCardMappings, gowidTransactions } from "@/lib/db/schema";
// after:
import { gowidCardMappings, gowidTransactions, expenses, companies } from "@/lib/db/schema";
```

Also add two new imports below:

```ts
import { classifyMealExpense } from "./financeone-classifier.service";
import { COMPANY_TO_ENTITY } from "@/lib/financeone/meal-accounts";
```

`db`, `eq`, `and`, `sql`, `inArray` are already imported.

- [ ] **Step 2: Add counter declaration**

Find the loop start (line ~122 area: `let notified = 0; let skippedDuplicate = 0; ...`). Add:

```ts
  let notified = 0;
  let skippedDuplicate = 0;
  let skippedNoMapping = 0;
  let autoClassifiedCount = 0;
```

- [ ] **Step 3: Resolve companyId on the mapping**

The codef path uses `gowidCardMappings`. Each mapping has `companyId`. Verify by checking the existing select earlier in `processCodefNotify`:

```bash
grep -n "select\|gowidCardMappings\|companyId" src/services/codef-notify.service.ts | head -20
```

If `companyId` isn't already part of the `cardLookup` map's value, modify the earlier mapping load (line ~85 area) so that `cardLookup` values include `companyId`. Specifically, ensure the SELECT lists `companyId` and the inserted Map carries it:

```ts
const mappingRows = await db
  .select()
  .from(gowidCardMappings)
  .where(eq(gowidCardMappings.isActive, true));
// `mappingRows` already includes companyId because we use `.select()` (all cols).
```

Then verify `cardLookup.set(...)` stores the full row (it should already — this is just sanity).

Also resolve `companyId → companySlug` once at the top of the function so we can map to `entityId`:

```ts
import { companies } from "@/lib/db/schema";
// ...
const companyRows = await db.select({ id: companies.id, slug: companies.slug }).from(companies);
const companyIdToSlug = new Map(companyRows.map((c) => [c.id, c.slug]));
```

Add the `companies` import to the existing schema import line.

Place this lookup right before the `for (const tx of transactions)` loop.

- [ ] **Step 4: Insert classifier branch**

In the loop, after the `if (alreadySubmitted) { ... continue; }` block but before `// Send notification` / `await createNotification(...)`, insert:

```ts
    // ---------------------------------------------------------------
    // Meal auto-classification
    // ---------------------------------------------------------------
    if (mapping.companyId) {
      const slug = companyIdToSlug.get(mapping.companyId);
      const entityId = slug ? (COMPANY_TO_ENTITY[slug] ?? null) : null;
      const mealMatch = await classifyMealExpense(tx.counterparty, entityId);

      if (mealMatch) {
        const [autoExp] = await db
          .insert(expenses)
          .values({
            type: "CORPORATE_CARD",
            status: "APPROVED",
            title: tx.counterparty ?? "법카 사용",
            amount: tx.amount,
            currency: "KRW",
            category: mealMatch.accountName,
            merchantName: tx.counterparty,
            transactionDate: tx.date,
            cardLastFour: mapping.cardLastFour,
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
    // ---------------------------------------------------------------
```

(Note: `tx.date` is already YYYY-MM-DD format per the SELECT in `fetchNewCodefTransactions`.)

- [ ] **Step 5: Update return value**

Find the `return { ... }` at the bottom of `processCodefNotify`. Add `autoClassified: autoClassifiedCount`:

```ts
  return {
    checked: transactions.length,
    notified,
    skippedDuplicate,
    skippedNoMapping,
    autoClassified: autoClassifiedCount,
  };
```

If the function has an explicit return type annotation, add `autoClassified: number` to it.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Lint**

```bash
npm run lint
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/services/codef-notify.service.ts
git commit -m "feat(codef): skip notification for auto-classified meal transactions"
```

---

## Task 7: 자동분류 필터 — validation schema + service

**Files:**
- Modify: `src/lib/validations/expense.ts:137-158`
- Modify: `src/services/expense.service.ts:214-265`

- [ ] **Step 1: Extend `expenseQuerySchema`**

In `src/lib/validations/expense.ts`, find the `expenseQuerySchema = z.object({ ... })` block. Add a new field:

```ts
export const expenseQuerySchema = z.object({
  // ... existing fields ...
  autoClassified: z.enum(["all", "auto", "manual"]).optional().default("all"),
});
```

(Append `autoClassified` at the end of the object before the closing `})`.)

- [ ] **Step 2: Use the filter in `getExpenses`**

In `src/services/expense.service.ts`, locate the WHERE-condition build-up (around line 224-262). Add an import if missing — `expenses` already imported. Add the condition near the `if (query.company)` block:

```ts
  if (query.autoClassified === "auto") {
    conditions.push(eq(expenses.autoClassified, true));
  } else if (query.autoClassified === "manual") {
    conditions.push(eq(expenses.autoClassified, false));
  }
  // "all" or undefined → no filter
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/validations/expense.ts src/services/expense.service.ts
git commit -m "feat(api): add autoClassified filter to expense queries"
```

---

## Task 8: Admin 페이지 — 필터 UI + 뱃지

**Files:**
- Modify: `src/app/(dashboard)/admin/expenses/page.tsx:27-52`
- Modify: `src/components/expenses/expense-filters.tsx`
- Modify: `src/components/expenses/expense-table.tsx`

- [ ] **Step 1: Pass `autoClassified` from page → service**

In `src/app/(dashboard)/admin/expenses/page.tsx`, in `getAdminExpensesData`, add a parser:

```ts
  const autoClassified = typeof searchParams.autoClassified === "string"
    ? (["all", "auto", "manual"].includes(searchParams.autoClassified)
        ? (searchParams.autoClassified as "all" | "auto" | "manual")
        : "all")
    : "all";
```

(Place after the existing `company` parsing.)

Then pass it to `getExpenses`:

```ts
  const result = await getExpenses(
    {
      page,
      limit: PAGE_SIZE,
      type: type as "CORPORATE_CARD" | "DEPOSIT_REQUEST" | undefined,
      status: status as "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED" | undefined,
      category,
      startDate,
      endDate,
      search,
      company,
      autoClassified,
    },
    user.id,
    user.role,
    false,
  );
```

Also add `autoClassified` to the per-expense projection:

```ts
  const expenses = result.data.map((item) => ({
    id: item.id,
    type: item.type,
    status: item.status,
    title: item.title,
    amount: item.amount,
    category: item.category,
    createdAt: item.createdAt?.toISOString() ?? "",
    submitter: item.submitter ?? null,
    isUrgent: item.isUrgent ?? false,
    companyName: item.companyName ?? null,
    companySlug: item.companySlug ?? null,
    autoClassified: item.autoClassified ?? false,
  }));
```

(The `getExpenses` projection already returns the full `expenses` row via `select({ expense: expenses, ... })`. In the consuming code that maps `result.data`, `item.autoClassified` should pass through. If `getExpenses` flattens and excludes the column, see Step 1b.)

- [ ] **Step 1b: Verify `getExpenses` returns autoClassified**

```bash
grep -n "select({" src/services/expense.service.ts | head -5
```

If `getExpenses` selects `expense: expenses` (whole row), `autoClassified` is included. If it later flattens (e.g., `result.data = items.map(i => ({ ...i.expense, ...i.companyName }))`), confirm `i.expense.autoClassified` is in the spread. Look at the function's `return { data: ... }` block (around line 320-360):

```bash
sed -n '320,380p' src/services/expense.service.ts
```

If the returned `data` is built via `items.map((row) => ({ ...row.expense, ... }))`, `autoClassified` flows automatically. If it's manually projected, add `autoClassified: row.expense.autoClassified` to the projection.

- [ ] **Step 2: Add filter dropdown to ExpenseFilters (admin only)**

In `src/components/expenses/expense-filters.tsx`, the existing dropdowns are TYPE / STATUS / CATEGORY. After CATEGORY's dropdown JSX, add a new admin-only dropdown for autoClassified.

First, the component needs to know if it's in admin context. Check current props:

```bash
grep -n "interface.*Props\|export function ExpenseFilters" src/components/expenses/expense-filters.tsx | head
```

If there are no props, add an optional prop:

```ts
interface ExpenseFiltersProps {
  showAdminFilters?: boolean;
}

export function ExpenseFilters({ showAdminFilters = false }: ExpenseFiltersProps = {}) {
```

Add an option list near the top of the file (after `STATUS_OPTIONS`):

```ts
const AUTO_CLASSIFIED_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "auto", label: "자동분류" },
  { value: "manual", label: "수동제출" },
];
```

Inside the JSX render, after the CATEGORY `<Select>` block, conditionally add:

```tsx
{showAdminFilters && (
  <Select
    value={searchParams.get("autoClassified") ?? "all"}
    onValueChange={(v) => v && handleFilterChange("autoClassified", v)}
  >
    <SelectTrigger className="glass-pill">
      <SelectValue>
        {AUTO_CLASSIFIED_OPTIONS.find(
          (o) => o.value === (searchParams.get("autoClassified") || "all")
        )?.label}
      </SelectValue>
    </SelectTrigger>
    <SelectContent>
      {AUTO_CLASSIFIED_OPTIONS.map((o) => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)}
```

(Match the styling/wrapper used by surrounding selects — copy a sibling `<Select>` and adjust.)

- [ ] **Step 3: Pass `showAdminFilters` from admin page**

In `src/app/(dashboard)/admin/expenses/page.tsx`, replace `<ExpenseFilters />` with:

```tsx
<ExpenseFilters showAdminFilters />
```

- [ ] **Step 4: Wire "전체 카테고리" reset to also clear autoClassified**

In `expense-filters.tsx`, find the `hasActiveFilter` / reset-button logic (line ~114 area). Add `autoClassified` to the active-filter detection:

```ts
const hasActiveFilter =
  searchParams.get("type") ||
  searchParams.get("status") ||
  searchParams.get("category") ||
  searchParams.get("autoClassified");
```

If a "Reset" button clears params, ensure it also clears `autoClassified`. (Look at the existing handler — it likely uses URLSearchParams `.delete(...)` or replaces the URL. Add `.delete("autoClassified")` to the reset path.)

- [ ] **Step 5: Add "자동분류" 뱃지 to ExpenseTable**

In `src/components/expenses/expense-table.tsx`, the `expenses` prop's row type needs `autoClassified?: boolean`. Find the type and add the field:

```bash
grep -n "interface.*Expense\|type.*Expense\|isUrgent" src/components/expenses/expense-table.tsx | head -10
```

In the row type (likely an interface or type alias), add:

```ts
  isUrgent?: boolean;
  autoClassified?: boolean;
```

In the JSX, find where the `긴급` badge is rendered (line ~174 and ~361). Right after each `긴급` badge, add a sibling auto-classified badge:

```tsx
{expense.isUrgent && <span className="glass-badge glass-badge-red shrink-0">긴급</span>}
{expense.autoClassified && <span className="glass-badge glass-badge-blue shrink-0">자동분류</span>}
```

If the project doesn't have a `glass-badge-blue` variant, use the same neutral styling as another non-red badge — check what the company-name badge uses:

```bash
grep -n "glass-badge\|glass-pill" src/components/expenses/expense-table.tsx | head -10
```

Use whatever neutral variant exists (e.g., `glass-badge`, `glass-badge-neutral`). If only `glass-badge-red` exists, fall back to `glass-badge` alone — the whimsy of "자동분류" is informational, not urgent.

- [ ] **Step 6: Type-check + lint**

```bash
npx tsc --noEmit
npm run lint
```

Expected: 0 errors each.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/admin/expenses/page.tsx \
        src/components/expenses/expense-filters.tsx \
        src/components/expenses/expense-table.tsx
git commit -m "feat(admin): auto-classified badge + filter on expenses page"
```

---

## Task 9: Smoke test — local dev server

**Files:** none (verification only)

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Expected: server up on `http://localhost:3000`.

- [ ] **Step 2: Trigger GoWid sync manually**

In a second terminal:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/gowid-sync | jq
```

Expected: JSON response includes `"autoClassified": <number>` field. If new transactions exist for known meal merchants, the count is > 0.

If `CRON_SECRET` is not set locally, use the unsecured `/api/gowid/sync` (admin-only, requires login session) — but the cron endpoint is the most direct test.

- [ ] **Step 3: Verify auto-created expenses in DB**

```bash
psql "$SUPABASE_DB_URL" -c "
  SELECT id, category, amount, merchant_name, status, auto_classified_source
  FROM expenseone.expenses
  WHERE auto_classified = true
  ORDER BY created_at DESC
  LIMIT 5;"
```

Expected: rows with `status='APPROVED'`, `category` ∈ {식비, 간식/커피, 점심, 약국식비, 리테일식비}, `auto_classified_source` ∈ {mapping_rules, history_majority}.

- [ ] **Step 4: Verify no notifications were created for auto-classified**

```bash
psql "$SUPABASE_DB_URL" -c "
  SELECT count(*)
  FROM expenseone.notifications n
  JOIN expenseone.expenses e ON e.id = n.link_url::text  -- adjust if link format differs
  WHERE e.auto_classified = true
    AND n.type = 'GOWID_NEW_TRANSACTION';"
```

Expected: 0. (Adjust the JOIN to whatever links notifications to expenses if the simple match doesn't work — the key is that no GOWID_NEW_TRANSACTION notification points at an auto-classified expense.)

A simpler check: any notification `created_at` > deploy time with type `GOWID_NEW_TRANSACTION`:

```bash
psql "$SUPABASE_DB_URL" -c "
  SELECT count(*) FROM expenseone.notifications
  WHERE type = 'GOWID_NEW_TRANSACTION'
    AND created_at > now() - interval '5 minutes';"
```

Compare against the `notified` count from Step 2's response — they should match exactly (auto-classified didn't generate notifications).

- [ ] **Step 5: Visit admin page**

Open `http://localhost:3000/admin/expenses` (logged in as ADMIN). Verify:
- 자동분류 뱃지가 자동 생성된 expense에 표시됨
- 필터 dropdown에 "자동분류 / 수동제출 / 전체" 옵션 노출
- "자동분류"만 선택 시 auto-classified rows만 노출

- [ ] **Step 6: Verify user-edit path on auto-classified expense**

As a MEMBER user (the submitter of an auto-classified expense), open `/expenses/<id>`. Verify:
- expense detail page renders normally (status APPROVED, category 식비, etc.)
- "수정" 버튼이 동일하게 동작 (category 변경 가능)

(Spec mandates auto-classified expenses are user-editable like normal expenses; this confirms no permission middleware accidentally locks them.)

- [ ] **Step 7: No commit** (verification only)

---

## Task 10: Deploy to Vercel

**Files:** none

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

Vercel auto-deploys main.

- [ ] **Step 2: Watch deploy logs**

```bash
# Vercel CLI (if installed):
vercel logs --follow

# Or open the dashboard:
open "https://vercel.com/<your-team>/expenseone/deployments"
```

Expected: build success, function init success.

- [ ] **Step 3: Apply migration to production DB**

```bash
psql "$SUPABASE_DB_URL" -f drizzle/0009_expenses_auto_classified.sql
```

(Same DB as dev in this project per memory `project_supabase_config.md` — verify before running.)

If dev and prod DBs are different, set `SUPABASE_DB_URL` to the prod URL temporarily.

Expected: `BEGIN`, `ALTER TABLE`, `CREATE INDEX`, `COMMIT` lines.

- [ ] **Step 4: Trigger production cron once manually (optional)**

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET_PROD" \
  https://expenseone.hanah1.com/api/cron/gowid-sync | jq
```

Expected: `autoClassified` field in response.

- [ ] **Step 5: Monitor for 1 day**

Day +1, run:

```bash
psql "$SUPABASE_DB_URL_PROD" -c "
  SELECT date(created_at) AS d,
         category,
         auto_classified_source,
         count(*) AS rows,
         sum(amount) AS total_won
  FROM expenseone.expenses
  WHERE auto_classified = true
    AND created_at > now() - interval '24 hours'
  GROUP BY date(created_at), category, auto_classified_source
  ORDER BY d DESC, rows DESC;"
```

Expected: realistic distribution — daily count > 0 if the company has any meal card activity, categories are meaningful (no surprises like "기타 구독"), no single counterparty dominating wrongly.

If counts seem wrong, check `gowid_transactions` for misclassifications:

```bash
psql "$SUPABASE_DB_URL_PROD" -c "
  SELECT g.store_name, e.category, e.auto_classified_source, e.amount
  FROM expenseone.gowid_transactions g
  JOIN expenseone.expenses e ON e.id = g.consumed_expense_id
  WHERE e.auto_classified = true
    AND g.created_at > now() - interval '24 hours'
  ORDER BY g.created_at DESC;"
```

Eyeball for any obviously-not-식비 merchants. If found, the next round of mapping_rules tuning happens in FinanceOne (out of scope here).

- [ ] **Step 6: Update memory**

Update `project_status.md` and `project_codef_integration.md` with the new auto-classify behavior so future sessions know it's live.

```
- 카드 결제 식비 자동분류 + Slack/푸시 알림 스킵 (2026-04-29)
- L1: financeone.mapping_rules / L2: history-majority
- 대상 leaf: EXP-030-001/002, EXP-093-001, EXP-094-001 (회식 제외)
- 신규 file: src/lib/financeone/meal-accounts.ts, financeone-classifier.service.ts
- DB: expenses.auto_classified*, idx_expenses_auto_classified
- Migration: drizzle/0009_expenses_auto_classified.sql
- Admin: 자동분류 뱃지 + 필터
```

---

## 검증 체크리스트 (사후)

- [ ] `tsc --noEmit` clean
- [ ] `npm run lint` clean
- [ ] Migration 0009 applied to dev + prod
- [ ] At least one auto-classified expense visible in `/admin/expenses` with 자동분류 뱃지
- [ ] Filter dropdown ("자동분류만") returns the same set
- [ ] No `GOWID_NEW_TRANSACTION` notification for auto-classified rows (cross-checked via timestamps)
- [ ] Cron response shows `autoClassified` count
- [ ] 1-day monitoring sample shows expected category distribution

---

## Out of scope (후속 작업)

- 자동분류 통계 위젯 (월별/카테고리별)
- ExpenseOne ↔ FinanceOne 양방향 sync (사용자 카테고리 정정 시 FinanceOne 갱신)
- 회식 자동분류 (운영 데이터 더 쌓이면 신뢰도 검증 후 합류 검토)
- 사용자별 옵트아웃 (현재는 전 사용자 동일하게 적용)
