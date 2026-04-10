# GoWid OpenAPI Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Codef with GoWid OpenAPI for automatic corporate card transaction detection, user notification, and expense form prefill.

**Architecture:** GoWid REST API (single company API key) → Vercel Cron daily sync → `gowid_transactions` staging table → notifications to mapped users → prefill corporate card form. Card-to-user mapping managed by admin via settings UI.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, Supabase (PostgreSQL), GoWid REST API, Web Push

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/gowid/client.ts` | GoWid REST API wrapper (fetch-based) |
| `src/services/gowid.service.ts` | Sync logic, card mapping CRUD, transaction staging |
| `src/app/api/cron/gowid-sync/route.ts` | Vercel Cron endpoint for daily sync |
| `src/app/api/gowid/card-mappings/route.ts` | API: list/create/update card mappings |
| `src/app/api/gowid/sync/route.ts` | API: manual sync trigger (admin only) |
| `src/app/(dashboard)/admin/gowid/page.tsx` | Admin settings page for GoWid card mapping |
| `src/app/(dashboard)/admin/gowid/gowid-card-mappings.tsx` | Client component for card mapping UI |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/db/schema.ts` | Add `gowidCardMappings`, `gowidTransactions` tables, `linkUrl` column to notifications, `GOWID_NEW_TRANSACTION` enum |
| `src/types/index.ts` | Add `GOWID_NEW_TRANSACTION` to `NotificationType` |
| `src/services/notification.service.ts` | Add `GOWID_NEW_TRANSACTION` to `createNotification` type union, support `linkUrl` |
| `src/app/(dashboard)/expenses/new/corporate-card/page.tsx` | Add GoWid prefill via `?gowidTxId=` query param |
| `src/app/(dashboard)/expenses/new/corporate-card/corporate-card-form.tsx` | Accept and display prefill data |
| `src/services/expense.service.ts` | Add `createCorporateCardFromGowid()` to consume staging row |
| `src/app/api/expenses/route.ts` | Handle `gowidTxId` query param |
| `vercel.json` | Add gowid-sync cron entry |
| `src/app/(dashboard)/admin/layout.tsx` or sidebar | Add GoWid nav link |

---

### Task 1: DB Schema — GoWid Tables + Notifications linkUrl

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add GOWID_NEW_TRANSACTION to notificationTypeEnum**

In `src/lib/db/schema.ts`, add the new value to the enum array:

```typescript
export const notificationTypeEnum = expenseSchema.enum("notification_type", [
  "DEPOSIT_APPROVED",
  "DEPOSIT_REJECTED",
  "NEW_DEPOSIT_REQUEST",
  "REMAINING_PAYMENT_REQUEST",
  "REMAINING_PAYMENT_APPROVED",
  "NEW_USER_JOINED",
  "DUE_DATE_REMINDER",
  "GOWID_NEW_TRANSACTION",
]);
```

- [ ] **Step 2: Add linkUrl column to notifications table**

The column already exists in the production DB (from Codef migration). Add it to the Drizzle schema:

```typescript
export const notifications = expenseSchema.table(
  "notifications",
  {
    // ... existing columns ...
    linkUrl: text("link_url"),  // ADD this after createdAt
  },
  // ... existing indexes ...
);
```

- [ ] **Step 3: Add gowidCardMappings table**

```typescript
export const gowidCardMappings = expenseSchema.table(
  "gowid_card_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardLastFour: varchar("card_last_four", { length: 4 }).notNull().unique(),
    cardAlias: varchar("card_alias", { length: 100 }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_gowid_card_user").on(table.userId),
  ],
);
```

- [ ] **Step 4: Add gowidTransactions table**

```typescript
export const gowidTransactions = expenseSchema.table(
  "gowid_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gowidExpenseId: integer("gowid_expense_id").notNull().unique(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    cardLastFour: varchar("card_last_four", { length: 4 }),
    cardAlias: varchar("card_alias", { length: 100 }),
    expenseDate: varchar("expense_date", { length: 8 }).notNull(),
    expenseTime: varchar("expense_time", { length: 6 }),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("KRW"),
    storeName: varchar("store_name", { length: 500 }),
    storeAddress: varchar("store_address", { length: 500 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    consumedExpenseId: uuid("consumed_expense_id").references(() => expenses.id, { onDelete: "set null" }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_gowid_tx_user_status").on(table.userId, table.status),
    index("idx_gowid_tx_consumed").on(table.consumedExpenseId),
  ],
);
```

- [ ] **Step 5: Add TypeScript type exports**

At the bottom of `schema.ts`:

```typescript
export type GowidCardMapping = typeof gowidCardMappings.$inferSelect;
export type NewGowidCardMapping = typeof gowidCardMappings.$inferInsert;

export type GowidTransaction = typeof gowidTransactions.$inferSelect;
export type NewGowidTransaction = typeof gowidTransactions.$inferInsert;
```

- [ ] **Step 6: Update types/index.ts**

Add `GOWID_NEW_TRANSACTION` to the `NotificationType` union:

```typescript
export type NotificationType =
  | 'DEPOSIT_APPROVED'
  | 'DEPOSIT_REJECTED'
  | 'NEW_DEPOSIT_REQUEST'
  | 'REMAINING_PAYMENT_REQUEST'
  | 'REMAINING_PAYMENT_APPROVED'
  | 'GOWID_NEW_TRANSACTION';
```

- [ ] **Step 7: Push schema to DB**

```bash
npx drizzle-kit push
```

Note: The `GOWID_NEW_TRANSACTION` enum value needs to be added to the existing `notification_type` enum in the DB. If `drizzle-kit push` doesn't handle enum additions, run manually:

```sql
ALTER TYPE expenseone.notification_type ADD VALUE IF NOT EXISTS 'GOWID_NEW_TRANSACTION';
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema.ts src/types/index.ts
git commit -m "feat: add GoWid card mappings and transactions schema"
```

---

### Task 2: GoWid API Client

**Files:**
- Create: `src/lib/gowid/client.ts`

- [ ] **Step 1: Create GoWid API client**

```typescript
// src/lib/gowid/client.ts

const GOWID_BASE_URL = "https://openapi.gowid.com";

function getApiKey(): string {
  const key = process.env.GOWID_API_KEY;
  if (!key) throw new Error("GOWID_API_KEY is not set");
  return key;
}

async function gowidFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GOWID_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: getApiKey(),
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GoWid API error ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.result?.code !== 20000000) {
    throw new Error(`GoWid API error: ${json.result?.desc ?? "unknown"}`);
  }

  return json.data as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GowidMember {
  userId: number;
  userName: string;
  email: string;
  isContractor: boolean;
  status: string;
  position: string;
  role: { type: string; name: string };
}

export interface GowidExpenseListItem {
  expenseId: number;
  expenseDate: string;       // YYYYMMDD
  expenseTime: string;       // HHMMSS
  useAmount: number;
  currency: string;
  krwAmount: number;
  approvalStatus: string;
  cardAlias: string | null;
  shortCardNumber: string;   // "롯데 9884"
  storeName: string;
  storeAddress: string;
  memo: string | null;
}

export interface GowidExpenseDetail extends GowidExpenseListItem {
  cardApprovalNumber: string;
  card: {
    cardNumber: string;
    cardType: string;
    cardName: string;
    alias: string | null;
  };
  isDomestic: boolean;
}

interface GowidPaginatedResponse<T> {
  totalPages: number;
  totalElements: number;
  last: boolean;
  content: T[];
}

// ---------------------------------------------------------------------------
// API Methods
// ---------------------------------------------------------------------------

export async function fetchGowidMembers(): Promise<GowidMember[]> {
  return gowidFetch<GowidMember[]>("/v1/members");
}

export async function fetchGowidNotSubmitted(
  page = 0,
  size = 100,
): Promise<GowidPaginatedResponse<GowidExpenseListItem>> {
  return gowidFetch<GowidPaginatedResponse<GowidExpenseListItem>>(
    `/v1/expenses/not-submitted?page=${page}&size=${size}`,
  );
}

export async function fetchGowidExpenseDetail(
  expenseId: number,
): Promise<GowidExpenseDetail> {
  return gowidFetch<GowidExpenseDetail>(`/v1/expenses/${expenseId}`);
}

/**
 * Extract last 4 digits from GoWid shortCardNumber like "롯데 9884"
 */
export function extractCardLastFour(shortCardNumber: string): string {
  const match = shortCardNumber.match(/(\d{4})$/);
  return match ? match[1] : shortCardNumber.slice(-4);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/gowid/client.ts
git commit -m "feat: GoWid OpenAPI REST client"
```

---

### Task 3: GoWid Service — Sync Logic + Card Mapping CRUD

**Files:**
- Create: `src/services/gowid.service.ts`
- Modify: `src/services/notification.service.ts`

- [ ] **Step 1: Update notification service to support linkUrl and GOWID type**

In `src/services/notification.service.ts`, update `createNotification`:

```typescript
export async function createNotification(data: {
  recipientId: string;
  type: "DEPOSIT_APPROVED" | "DEPOSIT_REJECTED" | "NEW_DEPOSIT_REQUEST" | "REMAINING_PAYMENT_REQUEST" | "REMAINING_PAYMENT_APPROVED" | "NEW_USER_JOINED" | "GOWID_NEW_TRANSACTION";
  title: string;
  message: string;
  relatedExpenseId?: string | null;
  linkUrl?: string | null;
}) {
  const [notification] = await db
    .insert(notifications)
    .values({
      recipientId: data.recipientId,
      type: data.type,
      title: data.title,
      message: data.message,
      relatedExpenseId: data.relatedExpenseId ?? null,
      linkUrl: data.linkUrl ?? null,
    })
    .returning();

  return notification;
}
```

- [ ] **Step 2: Create gowid.service.ts**

```typescript
// src/services/gowid.service.ts

import { db } from "@/lib/db";
import {
  gowidCardMappings,
  gowidTransactions,
  users,
} from "@/lib/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import {
  fetchGowidNotSubmitted,
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
  // 1. Fetch all not-submitted expenses from GoWid (paginate)
  let allExpenses: GowidExpenseListItem[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await fetchGowidNotSubmitted(page, 100);
    allExpenses = allExpenses.concat(result.content);
    hasMore = !result.last;
    page++;
    if (page > 50) break; // safety cap
  }

  if (allExpenses.length === 0) {
    return { fetched: 0, newStaged: 0, notified: 0 };
  }

  // 2. Get existing GoWid expense IDs to skip duplicates
  const gowidIds = allExpenses.map((e) => e.expenseId);
  const existing = await db
    .select({ gowidExpenseId: gowidTransactions.gowidExpenseId })
    .from(gowidTransactions)
    .where(inArray(gowidTransactions.gowidExpenseId, gowidIds));

  const existingSet = new Set(existing.map((e) => e.gowidExpenseId));

  // 3. Get card mappings for user matching
  const mappings = await db
    .select()
    .from(gowidCardMappings)
    .where(eq(gowidCardMappings.isActive, true));

  const cardToUser = new Map(
    mappings
      .filter((m) => m.userId)
      .map((m) => [m.cardLastFour, { userId: m.userId!, companyId: m.companyId }]),
  );

  // 4. Insert new transactions + auto-discover new cards
  let newStaged = 0;
  let notified = 0;
  const newCardLastFours = new Set<string>();

  for (const expense of allExpenses) {
    if (existingSet.has(expense.expenseId)) continue;

    const lastFour = extractCardLastFour(expense.shortCardNumber);
    const mapping = cardToUser.get(lastFour);

    // Auto-discover card mappings (upsert without userId)
    if (!mappings.find((m) => m.cardLastFour === lastFour)) {
      newCardLastFours.add(lastFour);
    }

    // Insert staging row
    await db.insert(gowidTransactions).values({
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
    });
    newStaged++;

    // Notify mapped user
    if (mapping?.userId) {
      const amountStr = Math.round(expense.krwAmount).toLocaleString();
      await createNotification({
        recipientId: mapping.userId,
        type: "GOWID_NEW_TRANSACTION",
        title: "법카 사용 내역이 있습니다",
        message: `${expense.storeName} ${amountStr}원 — 비용으로 등록해주세요.`,
        linkUrl: `/expenses/new/corporate-card?gowidTxId=`,
      });

      // Update notifiedAt
      // We'll set it after we know the staging row ID — 
      // but since we just inserted, we can update by gowidExpenseId
      await db
        .update(gowidTransactions)
        .set({ notifiedAt: new Date() })
        .where(eq(gowidTransactions.gowidExpenseId, expense.expenseId));

      // Web Push (best-effort)
      sendPushToUser(
        mapping.userId,
        "법카 사용 내역",
        `${expense.storeName} ${amountStr}원`,
      ).catch((err) => console.error("[Push] GoWid 알림 실패:", err));

      notified++;
    }
  }

  // 5. Auto-register newly discovered cards
  for (const lastFour of newCardLastFours) {
    const matchingExpense = allExpenses.find(
      (e) => extractCardLastFour(e.shortCardNumber) === lastFour,
    );
    // Try auto-match by name
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
// Consume staging transaction (when user submits expense)
// ---------------------------------------------------------------------------

export async function consumeGowidTransaction(
  gowidTxId: string,
  expenseId: string,
) {
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
```

- [ ] **Step 3: Commit**

```bash
git add src/services/gowid.service.ts src/services/notification.service.ts
git commit -m "feat: GoWid sync service with card mapping and notifications"
```

---

### Task 4: Cron Endpoint + vercel.json

**Files:**
- Create: `src/app/api/cron/gowid-sync/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create cron route**

```typescript
// src/app/api/cron/gowid-sync/route.ts

import { NextResponse } from "next/server";
import { syncGowidTransactions } from "@/services/gowid.service";

export const maxDuration = 60;

export async function GET(request: Request) {
  // Verify CRON_SECRET
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncGowidTransactions();
    console.log("[GoWid Sync]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[GoWid Sync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sync failed" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Update vercel.json — replace codef-sync with gowid-sync**

```json
{
  "regions": ["hnd1"],
  "crons": [
    {
      "path": "/api/cron/due-date-check",
      "schedule": "0 0 * * *"
    },
    {
      "path": "/api/cron/gowid-sync",
      "schedule": "0 0 * * *"
    }
  ],
  "headers": [
    ...existing headers...
  ]
}
```

Note: `0 0 * * *` = UTC midnight = KST 9시. Vercel Hobby allows one daily cron per path.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/gowid-sync/route.ts vercel.json
git commit -m "feat: GoWid sync cron endpoint (daily KST 9am)"
```

---

### Task 5: Manual Sync + Card Mapping API Routes

**Files:**
- Create: `src/app/api/gowid/sync/route.ts`
- Create: `src/app/api/gowid/card-mappings/route.ts`

- [ ] **Step 1: Create manual sync API (admin only)**

```typescript
// src/app/api/gowid/sync/route.ts

import { NextResponse } from "next/server";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { syncGowidTransactions } from "@/services/gowid.service";

export async function POST() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다" } }, { status: 401 });
  }

  // Check admin role
  const supabase = await getCachedClient();
  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "관리자만 접근 가능합니다" } }, { status: 403 });
  }

  try {
    const result = await syncGowidTransactions();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[GoWid Manual Sync] Error:", error);
    return NextResponse.json(
      { error: { code: "SYNC_FAILED", message: error instanceof Error ? error.message : "동기화 실패" } },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Create card mappings API**

```typescript
// src/app/api/gowid/card-mappings/route.ts

import { NextResponse } from "next/server";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { listCardMappings, updateCardMappingUser } from "@/services/gowid.service";

// GET — list all card mappings
export async function GET() {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다" } }, { status: 401 });
  }

  const supabase = await getCachedClient();
  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "관리자만 접근 가능합니다" } }, { status: 403 });
  }

  const mappings = await listCardMappings();
  return NextResponse.json({ data: mappings });
}

// PATCH — update mapping userId
export async function PATCH(request: Request) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "로그인이 필요합니다" } }, { status: 401 });
  }

  const supabase = await getCachedClient();
  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "관리자만 접근 가능합니다" } }, { status: 403 });
  }

  const body = await request.json();
  const { mappingId, userId } = body as { mappingId: string; userId: string | null };

  if (!mappingId) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "mappingId 필수" } }, { status: 400 });
  }

  const updated = await updateCardMappingUser(mappingId, userId);
  if (!updated) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "매핑을 찾을 수 없습니다" } }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/gowid/
git commit -m "feat: GoWid API routes — manual sync + card mapping CRUD"
```

---

### Task 6: Admin GoWid Settings UI

**Files:**
- Create: `src/app/(dashboard)/admin/gowid/page.tsx`
- Create: `src/app/(dashboard)/admin/gowid/gowid-card-mappings.tsx`

- [ ] **Step 1: Create admin GoWid page (Server Component)**

```typescript
// src/app/(dashboard)/admin/gowid/page.tsx

import { redirect } from "next/navigation";
import { getAuthUser, getCachedClient } from "@/lib/supabase/cached";
import { GowidCardMappings } from "./gowid-card-mappings";

export const dynamic = "force-dynamic";

export default async function GowidSettingsPage() {
  const authUser = await getAuthUser();
  if (!authUser) redirect("/login");

  const supabase = await getCachedClient();
  const { data: user } = await supabase
    .from("users")
    .select("role")
    .eq("id", authUser.id)
    .single();

  if (user?.role !== "ADMIN") redirect("/");

  // Fetch all app users for the dropdown
  const { data: appUsers } = await supabase
    .from("users")
    .select("id, name, email")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div>
        <h1 className="text-title3 text-[var(--apple-label)]">
          고위드 카드 관리
        </h1>
        <p className="text-footnote text-[var(--apple-secondary-label)] mt-0.5">
          법인카드와 사용자를 매핑하고, 거래 내역을 동기화합니다.
        </p>
      </div>
      <GowidCardMappings
        appUsers={(appUsers ?? []).map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
        }))}
      />
    </div>
  );
}
```

- [ ] **Step 2: Create GowidCardMappings client component**

```typescript
// src/app/(dashboard)/admin/gowid/gowid-card-mappings.tsx

"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppUser {
  id: string;
  name: string;
  email: string;
}

interface CardMapping {
  id: string;
  cardLastFour: string;
  cardAlias: string | null;
  userId: string | null;
  companyId: string | null;
  isActive: boolean;
  userName: string | null;
  userEmail: string | null;
}

interface GowidCardMappingsProps {
  appUsers: AppUser[];
}

export function GowidCardMappings({ appUsers }: GowidCardMappingsProps) {
  const [mappings, setMappings] = useState<CardMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchMappings = useCallback(async () => {
    try {
      const res = await fetch("/api/gowid/card-mappings");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setMappings(json.data ?? []);
    } catch {
      toast.error("카드 매핑 정보를 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMappings(); }, [fetchMappings]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/gowid/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "동기화 실패");
      toast.success(`동기화 완료: ${json.newStaged}건 새로 등록, ${json.notified}건 알림 발송`);
      fetchMappings(); // refresh
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "동기화 실패");
    } finally {
      setSyncing(false);
    }
  };

  const handleUserChange = async (mappingId: string, userId: string | null) => {
    setUpdatingId(mappingId);
    try {
      const res = await fetch("/api/gowid/card-mappings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappingId, userId }),
      });
      if (!res.ok) throw new Error("업데이트 실패");
      toast.success("매핑이 업데이트되었습니다.");
      fetchMappings();
    } catch {
      toast.error("매핑 업데이트에 실패했습니다.");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-[var(--apple-secondary-label)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sync Button */}
      <div className="flex items-center justify-between">
        <p className="text-footnote text-[var(--apple-secondary-label)]">
          카드 {mappings.length}장
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          className="rounded-full glass border-[var(--apple-separator)]"
        >
          {syncing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          <span className="ml-1.5">{syncing ? "동기화 중..." : "지금 동기화"}</span>
        </Button>
      </div>

      {/* Card Mapping Table */}
      <div className="glass overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--apple-separator)]">
              <th className="px-4 py-3 text-left text-footnote font-medium text-[var(--apple-secondary-label)]">
                카드 (끝 4자리)
              </th>
              <th className="px-4 py-3 text-left text-footnote font-medium text-[var(--apple-secondary-label)]">
                카드 별칭
              </th>
              <th className="px-4 py-3 text-left text-footnote font-medium text-[var(--apple-secondary-label)]">
                매핑된 사용자
              </th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr
                key={m.id}
                className="border-b border-[var(--apple-separator)] last:border-0"
              >
                <td className="px-4 py-3 text-subheadline font-mono">
                  {m.cardLastFour}
                </td>
                <td className="px-4 py-3 text-subheadline text-[var(--apple-label)]">
                  {m.cardAlias || "—"}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={m.userId ?? ""}
                    onChange={(e) =>
                      handleUserChange(m.id, e.target.value || null)
                    }
                    disabled={updatingId === m.id}
                    className="w-full max-w-[200px] rounded-lg border border-[var(--apple-separator)] bg-transparent px-2 py-1.5 text-subheadline text-[var(--apple-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-blue)]"
                  >
                    <option value="">미매핑</option>
                    {appUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {mappings.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-footnote text-[var(--apple-secondary-label)]"
                >
                  카드 매핑이 없습니다. &ldquo;지금 동기화&rdquo; 버튼을 눌러 고위드에서 카드 정보를 가져오세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add GoWid link to admin sidebar/navigation**

Check the admin layout for navigation. Add a link to `/admin/gowid`:

In the admin navigation (wherever the sidebar links are defined for admin pages), add:

```typescript
{ href: "/admin/gowid", label: "고위드 카드", icon: CreditCard }
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/admin/gowid/
git commit -m "feat: admin GoWid card mapping settings page"
```

---

### Task 7: Corporate Card Form Prefill from GoWid

**Files:**
- Modify: `src/app/(dashboard)/expenses/new/corporate-card/page.tsx`
- Modify: `src/app/(dashboard)/expenses/new/corporate-card/corporate-card-form.tsx`

- [ ] **Step 1: Update page.tsx to pass prefill data**

```typescript
// src/app/(dashboard)/expenses/new/corporate-card/page.tsx

import { getActiveCompanies } from "@/services/company.service";
import { getAuthUser } from "@/lib/supabase/cached";
import { getPendingGowidTransaction } from "@/services/gowid.service";
import CorporateCardForm from "./corporate-card-form";

export const dynamic = "force-dynamic";

interface PrefillData {
  amount: number;
  merchantName: string | null;
  transactionDate: string; // YYYY-MM-DD
  gowidTxId: string;
}

export default async function CorporateCardPage({
  searchParams,
}: {
  searchParams: Promise<{ gowidTxId?: string }>;
}) {
  const companies = await getActiveCompanies();
  const serialized = companies.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    currency: c.currency,
  }));

  // GoWid prefill
  let prefillData: PrefillData | undefined;
  const params = await searchParams;

  if (params.gowidTxId) {
    const authUser = await getAuthUser();
    if (authUser) {
      const tx = await getPendingGowidTransaction(params.gowidTxId, authUser.id);
      if (tx) {
        // Convert YYYYMMDD → YYYY-MM-DD
        const d = tx.expenseDate;
        const dateStr = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        prefillData = {
          amount: tx.amount,
          merchantName: tx.storeName,
          transactionDate: dateStr,
          gowidTxId: tx.id,
        };
      }
    }
  }

  return (
    <CorporateCardForm
      initialCompanies={serialized}
      prefillData={prefillData}
    />
  );
}
```

- [ ] **Step 2: Update CorporateCardForm to accept prefill**

Add `prefillData` prop and pre-populate fields:

```typescript
interface CorporateCardFormProps {
  initialCompanies?: { id: string; name: string; slug: string; currency: string }[];
  prefillData?: {
    amount: number;
    merchantName: string | null;
    transactionDate: string;
    gowidTxId: string;
  };
}

export default function CorporateCardForm({ initialCompanies, prefillData }: CorporateCardFormProps) {
  // ... existing state ...

  // Pre-fill from GoWid
  useEffect(() => {
    if (!prefillData) return;

    // Amount
    setAmountDisplay(formatAmount(prefillData.amount));
    setSupplyAmount(prefillData.amount);
    setValue("amount", prefillData.amount, { shouldValidate: true });

    // Merchant name
    if (prefillData.merchantName) {
      setValue("merchantName", prefillData.merchantName);
      setShowCustomMerchant(true);
    }
  }, [prefillData, setValue]);

  // ... in onSubmit, include gowidTxId as query param ...
  const onSubmit = async (data: CorporateCardFormData) => {
    setIsSubmitting(true);
    try {
      const url = prefillData?.gowidTxId
        ? `/api/expenses?gowidTxId=${prefillData.gowidTxId}`
        : "/api/expenses";

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CORPORATE_CARD",
          title: data.title,
          description: data.description || null,
          amount: data.amount,
          currency: currency,
          category: data.category,
          merchantName: data.merchantName || undefined,
          transactionDate: prefillData?.transactionDate ?? formatDateISO(new Date()),
          isUrgent: false,
          companyId: companyId || undefined,
        }),
      });
      // ... rest unchanged ...
    }
  };

  // ... in the JSX, show prefill info banner if from GoWid ...
  // After the header, before the form:
  {prefillData && (
    <div className="p-3 rounded-xl bg-[rgba(0,122,255,0.08)] border border-[rgba(0,122,255,0.15)]">
      <p className="text-[13px] text-[var(--apple-blue)]">
        고위드에서 가져온 거래 정보가 자동 입력되었습니다.
        제목과 카테고리를 선택한 뒤 제출해주세요.
      </p>
    </div>
  )}
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/expenses/new/corporate-card/
git commit -m "feat: corporate card form prefill from GoWid transaction"
```

---

### Task 8: Expense API — Consume GoWid Staging on Submit

**Files:**
- Modify: `src/app/api/expenses/route.ts`

- [ ] **Step 1: Handle gowidTxId in POST /api/expenses**

At the top of the POST handler, after creating the expense:

```typescript
// After expense is created successfully...
// If gowidTxId is present, consume the staging transaction
const url = new URL(request.url);
const gowidTxId = url.searchParams.get("gowidTxId");
if (gowidTxId && expense.id) {
  const { consumeGowidTransaction } = await import("@/services/gowid.service");
  await consumeGowidTransaction(gowidTxId, expense.id).catch((err) =>
    console.error("[GoWid] consume staging failed:", err),
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/expenses/route.ts
git commit -m "feat: consume GoWid staging transaction on expense submit"
```

---

### Task 9: Environment Variable + Deploy

**Files:**
- Modify: `.env.local` (local only)

- [ ] **Step 1: Add GOWID_API_KEY to .env.local**

```
GOWID_API_KEY=57babdd8-5636-4f11-8f2f-1061069f6799
```

- [ ] **Step 2: Add to Vercel environment variables**

```bash
npx vercel env add GOWID_API_KEY production
# Enter: 57babdd8-5636-4f11-8f2f-1061069f6799
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Fix any type errors.

- [ ] **Step 4: Test locally**

```bash
npm run dev
# Test: curl http://localhost:3000/api/gowid/sync -X POST (with auth cookie)
```

- [ ] **Step 5: Push and deploy**

```bash
git push origin main
```

Vercel auto-deploys on push to main.

- [ ] **Step 6: Verify production**

1. Visit `/admin/gowid` — should show card list
2. Click "지금 동기화" — should fetch GoWid data
3. Map a card to a user
4. Check if notifications appear for that user

---

### Task 10: Initial Card Mapping Seed

After first deploy, run sync to auto-discover cards and auto-match by name.

- [ ] **Step 1: Trigger initial sync**

```bash
curl -X POST https://expenseone.vercel.app/api/gowid/sync \
  -H "Cookie: <admin session cookie>"
```

Or use the admin UI "지금 동기화" button.

- [ ] **Step 2: Verify auto-matched cards**

Expected auto-matches (name match):
- 김영수 → 김영수 (ys@hanah1.com)
- 이동현 → 이동현 (dhlee@hanah1.com)
- 이창석 → 이창석 (ian@hanah1.com)
- 하승완 → 하승완 (shawn@hanah1.com)
- 한로제 → 한로제 (rossehan@hanah1.com)
- 황은상 → 황은상 (eshwang@hanah1.com)

Manually map remaining if needed.
