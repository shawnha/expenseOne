# Multi-Company Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한아원코리아/한아원리테일 두 회사를 지원하도록 ExpenseOne에 멀티 회사 기능을 추가한다.

**Architecture:** companies 테이블을 추가하고, users/expenses/departments에 company_id FK를 추가. 비용 제출 시 회사를 선택하며 소속 회사가 기본값. Slack 알림은 companies.slack_channel_id 기반으로 라우팅.

**Tech Stack:** Next.js 14+ (App Router), Drizzle ORM, Supabase PostgreSQL, Zod, shadcn/ui, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-31-multi-company-design.md`

---

## File Structure

### New Files
- `src/lib/db/schema.ts` — companies 테이블 추가 (기존 파일 수정)
- `src/services/company.service.ts` — 회사 CRUD + 조회 서비스
- `src/lib/validations/company.ts` — 회사 관련 Zod 스키마
- `src/app/api/companies/route.ts` — GET (목록), POST (생성)
- `src/app/api/companies/[id]/route.ts` — PATCH (수정)
- `src/components/forms/company-selector.tsx` — 회사 세그먼트 컨트롤 공용 컴포넌트
- `drizzle/seed-companies.sql` — 시드 데이터 SQL

### Modified Files
- `src/lib/db/schema.ts` — departments, users, expenses에 companyId 추가
- `src/lib/validations/expense.ts` — createExpenseSchema, expenseQuerySchema에 companyId
- `src/services/slack.service.ts` — sendSlackMessage에 companyId 라우팅
- `src/services/expense.service.ts` — createExpense에 companyId 전파
- `src/services/notification.service.ts` — Slack 호출 시 companyId 전달
- `src/app/api/expenses/route.ts` — POST/GET에 companyId 처리
- `src/app/api/departments/route.ts` — 회사별 부서 필터
- `src/app/(dashboard)/expenses/new/corporate-card/page.tsx` — 회사 선택 UI
- `src/app/(dashboard)/expenses/new/deposit-request/page.tsx` — 회사 선택 UI
- `src/app/(dashboard)/admin/page.tsx` — 회사 필터 탭
- `src/app/(dashboard)/admin/expenses/page.tsx` — 회사 필터
- `src/app/(dashboard)/admin/pending/page.tsx` — 회사 필터
- `src/app/(dashboard)/admin/departments/page.tsx` — 회사별 부서
- `src/app/(dashboard)/admin/users/page.tsx` — 회사 컬럼
- `src/app/(dashboard)/settings/settings-form.tsx` — 소속 회사 선택
- `src/app/onboarding/page.tsx` — 회사 선택 단계
- `src/app/(dashboard)/layout.tsx` — 기존 유저 company 선택 모달
- `src/components/layout/sidebar.tsx` — 회사 관리 메뉴
- `src/app/api/export/csv/route.ts` — 회사 컬럼 추가

---

## Phase 1: DB Schema + Companies Service

### Task 1: companies 테이블 추가 + company_id 컬럼 추가

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/seed-companies.sql`

- [ ] **Step 1: schema.ts에 companies 테이블 정의 추가**

`departments` 테이블 위(line 69 이전)에 추가:

```typescript
/**
 * companies -- 회사 테이블
 */
export const companies = expenseSchema.table("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).unique().notNull(),
  slug: varchar("slug", { length: 50 }).unique().notNull(),
  slackChannelId: varchar("slack_channel_id", { length: 50 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

- [ ] **Step 2: departments 테이블에 companyId 추가**

`departments` 테이블 정의에 `companyId` FK 추가. `.unique()` 제약을 제거하고 테이블 인자로 이동:

```typescript
export const departments = expenseSchema.table("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  companyId: uuid("company_id").references(() => companies.id),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  index("idx_departments_company").on(table.companyId),
]);
```

- [ ] **Step 3: users 테이블에 companyId 추가**

`users` 테이블 정의에 추가 (line 86 `department` 뒤):

```typescript
companyId: uuid("company_id").references(() => companies.id),
```

- [ ] **Step 4: expenses 테이블에 companyId 추가 + 복합 인덱스**

`expenses` 테이블 정의에 `submittedById` 앞에 추가:

```typescript
companyId: uuid("company_id").references(() => companies.id),
```

인덱스 배열에 추가:

```typescript
index("idx_expenses_company_type_status").on(
  table.companyId,
  table.type,
  table.status,
  table.createdAt,
),
```

- [ ] **Step 5: TypeScript 타입 export 추가**

파일 하단에 추가:

```typescript
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
```

- [ ] **Step 6: 시드 SQL 작성**

`drizzle/seed-companies.sql` 생성:

```sql
-- Seed companies
INSERT INTO expenseone.companies (name, slug, slack_channel_id, sort_order)
VALUES
  ('한아원코리아', 'korea', 'C08SDPDFUEP', 0),
  ('한아원리테일', 'retail', NULL, 1)
ON CONFLICT (slug) DO NOTHING;
```

- [ ] **Step 7: drizzle-kit push로 스키마 반영**

```bash
npx drizzle-kit push
```

- [ ] **Step 8: 시드 실행**

```bash
psql "$SUPABASE_DB_URL" -f drizzle/seed-companies.sql
```

- [ ] **Step 9: 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 10: 커밋**

```bash
git add src/lib/db/schema.ts drizzle/seed-companies.sql
git commit -m "feat: add companies table and company_id to users/expenses/departments"
```

---

### Task 2: Company Service + Validation + API

**Files:**
- Create: `src/services/company.service.ts`
- Create: `src/lib/validations/company.ts`
- Create: `src/app/api/companies/route.ts`
- Create: `src/app/api/companies/[id]/route.ts`

- [ ] **Step 1: Zod validation 스키마**

`src/lib/validations/company.ts`:

```typescript
import { z } from "zod";

export const createCompanySchema = z.object({
  name: z.string().min(1, "회사명을 입력해주세요").max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "영문 소문자, 숫자, 하이픈만 가능"),
  slackChannelId: z.string().max(50).optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
});

export const updateCompanySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slackChannelId: z.string().max(50).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
```

- [ ] **Step 2: Company service**

`src/services/company.service.ts`:

```typescript
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq, asc, and, ne, count } from "drizzle-orm";

export async function getActiveCompanies() {
  return db
    .select()
    .from(companies)
    .where(eq(companies.isActive, true))
    .orderBy(asc(companies.sortOrder), asc(companies.name));
}

export async function getAllCompanies() {
  return db
    .select()
    .from(companies)
    .orderBy(asc(companies.sortOrder), asc(companies.name));
}

export async function getCompanyById(id: string) {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id));
  return company ?? null;
}

export async function getCompanyBySlug(slug: string) {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.slug, slug));
  return company ?? null;
}

export async function createCompany(input: {
  name: string;
  slug: string;
  slackChannelId?: string | null;
  sortOrder?: number;
}) {
  const [company] = await db
    .insert(companies)
    .values({
      name: input.name,
      slug: input.slug,
      slackChannelId: input.slackChannelId ?? null,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return company;
}

export async function updateCompany(
  id: string,
  input: {
    name?: string;
    slackChannelId?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  },
) {
  // Prevent deactivating last active company
  if (input.isActive === false) {
    const [activeCount] = await db
      .select({ count: count() })
      .from(companies)
      .where(and(eq(companies.isActive, true), ne(companies.id, id)));
    if ((activeCount?.count ?? 0) === 0) {
      throw new Error("최소 1개의 활성 회사가 필요합니다.");
    }
  }

  const [updated] = await db
    .update(companies)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(companies.id, id))
    .returning();
  return updated ?? null;
}
```

- [ ] **Step 3: Companies API routes**

`src/app/api/companies/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getCachedCurrentUser } from "@/lib/supabase/cached";
import { getActiveCompanies, getAllCompanies, createCompany } from "@/services/company.service";
import { createCompanySchema } from "@/lib/validations/company";

export async function GET(request: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } }, { status: 401 });
  }

  const all = request.nextUrl.searchParams.get("all") === "true";
  const user = await getCachedCurrentUser();

  if (all && user?.role === "ADMIN") {
    const data = await getAllCompanies();
    return NextResponse.json({ data });
  }

  const data = await getActiveCompanies();
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } }, { status: 401 });
  }
  const user = await getCachedCurrentUser();
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "관리자만 접근 가능합니다." } }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message } }, { status: 400 });
  }

  try {
    const company = await createCompany(parsed.data);
    return NextResponse.json({ data: company }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "회사 생성에 실패했습니다." } }, { status: 500 });
  }
}
```

`src/app/api/companies/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getCachedCurrentUser } from "@/lib/supabase/cached";
import { updateCompany } from "@/services/company.service";
import { updateCompanySchema } from "@/lib/validations/company";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authUser = await getAuthUser();
  if (!authUser) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "인증이 필요합니다." } }, { status: 401 });
  }
  const user = await getCachedCurrentUser();
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "관리자만 접근 가능합니다." } }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = updateCompanySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message } }, { status: 400 });
  }

  try {
    const company = await updateCompany(id, parsed.data);
    if (!company) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "회사를 찾을 수 없습니다." } }, { status: 404 });
    }
    return NextResponse.json({ data: company });
  } catch (err) {
    const message = err instanceof Error ? err.message : "회사 수정에 실패했습니다.";
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message } }, { status: 500 });
  }
}
```

- [ ] **Step 4: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add src/services/company.service.ts src/lib/validations/company.ts src/app/api/companies/
git commit -m "feat: add company service, validation, and API routes"
```

---

## Phase 2: Slack Routing + Expense Service

### Task 3: Slack 서비스 회사별 라우팅

**Files:**
- Modify: `src/services/slack.service.ts`

- [ ] **Step 1: sendSlackMessage에 companyId 파라미터 추가**

`sendSlackMessage` 함수를 수정 — companyId를 받아서 companies 테이블에서 채널 조회:

```typescript
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
```

```typescript
async function getSlackChannelForCompany(companyId?: string): Promise<string | null> {
  if (companyId) {
    const [company] = await db
      .select({ slackChannelId: companies.slackChannelId })
      .from(companies)
      .where(eq(companies.id, companyId));
    if (company?.slackChannelId) return company.slackChannelId;
  }
  // Fallback to env var
  return process.env.SLACK_CHANNEL_ID || null;
}

async function sendSlackMessage(text: string, companyId?: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = await getSlackChannelForCompany(companyId);

  if (!token || !channel) {
    console.warn("[Slack] 토큰 또는 채널 미설정", { hasToken: !!token, channel, companyId });
    return;
  }

  // ... 기존 fetch 로직 동일
}
```

- [ ] **Step 2: notifySlackCorporateCard에 companyId 추가**

params 타입에 `companyId?: string` 추가, `sendSlackMessage` 호출 시 전달:

```typescript
export async function notifySlackCorporateCard(params: {
  submitterEmail: string;
  submitterName: string;
  title: string;
  amount: number;
  category: string;
  expenseUrl: string;
  companyId?: string;
}): Promise<void> {
  // ... 기존 text 조합 로직 동일
  await sendSlackMessage(text, params.companyId);
}
```

- [ ] **Step 3: notifySlackApproved에 companyId 추가**

동일하게 params에 `companyId?: string` 추가:

```typescript
export async function notifySlackApproved(params: {
  submitterEmail: string;
  submitterName: string;
  approverName: string;
  title: string;
  amount: number;
  expenseUrl: string;
  companyId?: string;
}): Promise<void> {
  // ... 기존 text 조합 로직 동일
  await sendSlackMessage(text, params.companyId);
}
```

- [ ] **Step 4: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add src/services/slack.service.ts
git commit -m "feat: Slack routing by company — channel lookup from companies table"
```

---

### Task 4: Expense 서비스 + Notification 서비스에 companyId 전파

**Files:**
- Modify: `src/services/expense.service.ts`
- Modify: `src/services/notification.service.ts`
- Modify: `src/lib/validations/expense.ts`

- [ ] **Step 1: Zod 스키마에 companyId 추가**

`src/lib/validations/expense.ts`의 `baseExpenseFields`에 추가:

```typescript
const baseExpenseFields = {
  // ... 기존 필드 유지
  companyId: z.string().uuid("올바른 회사 ID를 입력해주세요").optional(),
};
```

`expenseQuerySchema`에 추가:

```typescript
company: z.string().max(50).optional(), // slug
```

`csvExportQuerySchema`에도 추가:

```typescript
company: z.string().max(50).optional(),
```

- [ ] **Step 2: expense.service.ts의 createExpense에 companyId 처리**

`createExpense` 함수에서 companyId 처리 추가. `baseData`에 포함:

```typescript
export async function createExpense(
  input: CreateExpenseInput,
  userId: string,
  userName: string,
  userEmail: string,
  userCompanyId?: string | null,
) {
  // companyId: input에 있으면 사용, 없으면 userCompanyId 폴백
  const companyId = input.companyId || userCompanyId || null;

  const baseData: Partial<NewExpense> = {
    // ... 기존 필드
    companyId,
  };
```

Slack 알림 호출에 companyId 추가:

```typescript
notifySlackCorporateCard({
  // ... 기존 필드
  companyId: companyId ?? undefined,
})
```

- [ ] **Step 3: expense.service.ts의 getExpenses에 company 필터 추가**

`getExpenses`에서 company slug 필터 지원:

```typescript
if (query.company) {
  const { getCompanyBySlug } = await import("@/services/company.service");
  const company = await getCompanyBySlug(query.company);
  if (company) {
    conditions.push(eq(expenses.companyId, company.id));
  }
}
```

- [ ] **Step 4: notification.service.ts에서 Slack 호출 시 companyId 전달**

`notifyExpenseApproved`에서 expense의 companyId를 가져와서 Slack에 전달:

```typescript
export async function notifyExpenseApproved(
  submitterId: string,
  expenseId: string,
  expenseTitle: string,
  extra?: {
    amount: number;
    approverName: string;
    submitterName: string;
    submitterEmail: string;
    companyId?: string | null;
  },
) {
  // ... createNotification 동일

  if (extra) {
    sideEffects.push(
      notifySlackApproved({
        // ... 기존 필드
        companyId: extra.companyId ?? undefined,
      }).catch((err) => console.error("[Slack] 승인 알림 실패:", err)),
    );
  }
```

`approveExpense`, `rejectExpense`에서 호출할 때 expense.companyId 전달.

- [ ] **Step 5: API route 수정**

`src/app/api/expenses/route.ts`의 POST에서 userCompanyId 전달:

```typescript
const expense = await createExpense(parsed.data, user.id, user.name, user.email, user.companyId);
```

GET에서 company 파라미터 처리:

```typescript
const company = searchParams.get("company") ?? undefined;
// expenseQuerySchema parse에 포함
```

- [ ] **Step 6: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add src/services/expense.service.ts src/services/notification.service.ts src/lib/validations/expense.ts src/app/api/expenses/route.ts
git commit -m "feat: propagate companyId through expense creation and Slack notifications"
```

---

## Phase 3: Frontend — 제출 폼 + 공용 컴포넌트

### Task 5: CompanySelector 공용 컴포넌트

**Files:**
- Create: `src/components/forms/company-selector.tsx`

- [ ] **Step 1: CompanySelector 컴포넌트 작성**

```typescript
"use client";

import { useEffect, useState } from "react";

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface CompanySelectorProps {
  value: string;
  onChange: (companyId: string) => void;
  userCompanyId?: string | null;
}

export function CompanySelector({ value, onChange, userCompanyId }: CompanySelectorProps) {
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    fetch("/api/companies")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setCompanies(data.data);
      })
      .catch(() => {});
  }, []);

  if (companies.length <= 1) return null;

  const isOtherCompany = value && userCompanyId && value !== userCompanyId;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-[var(--apple-secondary-label)]">회사</span>
      <div className="flex rounded-xl bg-[var(--apple-system-grouped-background)] p-[3px] gap-[2px]">
        {companies.map((company) => (
          <button
            key={company.id}
            type="button"
            onClick={() => onChange(company.id)}
            className={`flex-1 text-center py-2 px-3 rounded-[10px] text-sm font-medium transition-all duration-200 ${
              value === company.id
                ? "bg-[var(--apple-blue)] text-white shadow-sm"
                : "text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]"
            }`}
          >
            {company.name}
          </button>
        ))}
      </div>
      {isOtherCompany && (
        <span className="text-[11px] text-[var(--apple-secondary-label)]">
          소속 외 회사가 선택되었습니다
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/forms/company-selector.tsx
git commit -m "feat: add CompanySelector segmented control component"
```

---

### Task 6: 법카사용 + 입금요청 폼에 회사 선택 추가

**Files:**
- Modify: `src/app/(dashboard)/expenses/new/corporate-card/page.tsx`
- Modify: `src/app/(dashboard)/expenses/new/deposit-request/page.tsx`

- [ ] **Step 1: 법카사용 폼에 CompanySelector 추가**

법카사용 페이지 상단에 import 추가:

```typescript
import { CompanySelector } from "@/components/forms/company-selector";
```

폼 state에 companyId 추가 (서버에서 user.companyId를 props로 내려줌):

```typescript
const [companyId, setCompanyId] = useState(userCompanyId ?? "");
```

폼 JSX에서 제목 필드 위에 CompanySelector 삽입:

```tsx
<CompanySelector
  value={companyId}
  onChange={setCompanyId}
  userCompanyId={userCompanyId}
/>
```

onSubmit에서 companyId 포함:

```typescript
body: JSON.stringify({ ...data, companyId }),
```

- [ ] **Step 2: 입금요청 폼에도 동일하게 추가**

동일 패턴 적용 — import, state, JSX, onSubmit.

- [ ] **Step 3: 서버 컴포넌트에서 userCompanyId 전달**

두 폼 모두 서버 컴포넌트에서 user.companyId를 클라이언트 컴포넌트에 prop으로 전달해야 함.
현재 `getCachedCurrentUser()`로 가져오는 user 객체에 companyId가 포함되도록 확인.

- [ ] **Step 4: 회사 변경 시 부서 목록 갱신**

부서 select의 fetch URL에 companyId 쿼리 추가:

```typescript
useEffect(() => {
  const url = companyId ? `/api/departments?companyId=${companyId}` : "/api/departments";
  fetch(url)
    .then((res) => res.json())
    .then((data) => {
      if (data.data) setDepartments(data.data);
      setDepartment(""); // 기존 선택 초기화
    })
    .catch(() => {});
}, [companyId]);
```

- [ ] **Step 5: departments API에 companyId 필터 추가**

`src/app/api/departments/route.ts`의 GET에서:

```typescript
const companyId = request.nextUrl.searchParams.get("companyId");
let query = db.select().from(departments).orderBy(asc(departments.sortOrder), asc(departments.name));
if (companyId) {
  query = query.where(eq(departments.companyId, companyId));
}
```

- [ ] **Step 6: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add src/app/(dashboard)/expenses/new/ src/app/api/departments/route.ts
git commit -m "feat: add company selector to expense submission forms"
```

---

## Phase 4: Admin 페이지 회사 필터

### Task 7: Admin 대시보드/비용/승인대기에 회사 필터 탭

**Files:**
- Modify: `src/app/(dashboard)/admin/page.tsx`
- Modify: `src/app/(dashboard)/admin/expenses/page.tsx`
- Modify: `src/app/(dashboard)/admin/pending/page.tsx`
- Modify: `src/app/api/admin/dashboard/route.ts`

- [ ] **Step 1: Admin 대시보드 API에 company 필터 추가**

`/api/admin/dashboard`의 쿼리에 company slug 파라미터 지원. company slug → company_id 변환 후 WHERE 조건 추가.

- [ ] **Step 2: Admin 대시보드 클라이언트에 회사 필터 탭 추가**

대시보드 상단에 세그먼트 컨트롤: `전체 | 한아원코리아 | 한아원리테일`
선택 시 `?company=korea` 쿼리파라미터로 데이터 re-fetch.

- [ ] **Step 3: Admin 비용 목록에 회사 필터 + 라벨**

비용 목록 서버 컴포넌트에서 `company` 쿼리파라미터를 getExpenses에 전달.
비용 행에 회사명 배지 표시 (컬러 구분).

- [ ] **Step 4: 승인 대기 목록에 회사 필터 + 라벨**

동일 패턴. getPendingExpenses 쿼리에 company 필터 추가.

- [ ] **Step 5: 비용 목록에 회사 JOIN 추가**

getExpenses 쿼리에 companies 테이블 LEFT JOIN하여 회사명 포함:

```typescript
.leftJoin(companies, eq(expenses.companyId, companies.id))
```

반환 데이터에 `companyName`, `companySlug` 포함.

- [ ] **Step 6: 타입 체크 + 커밋**

```bash
npx tsc --noEmit
git add src/app/(dashboard)/admin/ src/app/api/admin/
git commit -m "feat: add company filter tabs to admin dashboard, expenses, pending pages"
```

---

### Task 8: 부서 관리 + 사용자 관리에 회사 반영

**Files:**
- Modify: `src/app/(dashboard)/admin/departments/page.tsx`
- Modify: `src/app/(dashboard)/admin/users/page.tsx`
- Modify: `src/app/api/departments/route.ts` (POST/PATCH에 companyId)

- [ ] **Step 1: 부서 CRUD에 companyId 필수화**

부서 생성 API의 Zod 스키마에 `companyId: z.string().uuid()` 추가.
부서 생성 시 `companyId` DB에 저장.
부서 관리 페이지에 회사 필터 추가.

- [ ] **Step 2: 사용자 관리에 회사 컬럼 추가**

사용자 목록 쿼리에 companies JOIN. 테이블에 "회사" 컬럼 추가.

- [ ] **Step 3: CSV export에 회사 컬럼 추가**

`src/app/api/export/csv/route.ts`에서 회사 필터 + 회사명 컬럼 추가.

- [ ] **Step 4: 커밋**

```bash
npx tsc --noEmit
git add src/app/(dashboard)/admin/departments/ src/app/(dashboard)/admin/users/ src/app/api/departments/ src/app/api/export/
git commit -m "feat: company-scoped departments, user company column, CSV company export"
```

---

## Phase 5: 설정 + 온보딩 + 기존 유저 마이그레이션

### Task 9: 설정 페이지에 소속 회사 선택

**Files:**
- Modify: `src/app/(dashboard)/settings/settings-form.tsx`
- Modify: `src/app/api/profile/route.ts`

- [ ] **Step 1: SettingsForm에 CompanySelector 추가**

개인 정보 섹션에 소속 회사 선택 추가.
저장 시 `companyId`를 `/api/profile` PATCH에 포함.

- [ ] **Step 2: Profile API에 companyId 처리**

PATCH `/api/profile`에서 `companyId` 필드를 users 테이블에 저장.

- [ ] **Step 3: 커밋**

```bash
git add src/app/(dashboard)/settings/ src/app/api/profile/
git commit -m "feat: add company selection to settings profile"
```

---

### Task 10: 온보딩 + 기존 유저 회사 선택 모달

**Files:**
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: 온보딩에 회사 선택 단계 추가**

온보딩 폼에 CompanySelector 추가. 회사 미선택 시 제출 불가.
POST `/api/onboarding`에 companyId 포함.

- [ ] **Step 2: 기존 유저 회사 선택 모달**

`src/app/(dashboard)/layout.tsx`에서 user.companyId가 null이면 회사 선택 모달 표시.
모달에서 선택 후 `/api/profile` PATCH 호출 → 리로드.

- [ ] **Step 3: 커밋**

```bash
git add src/app/onboarding/ src/app/(dashboard)/layout.tsx
git commit -m "feat: company selection in onboarding + existing user migration modal"
```

---

## Phase 6: Data Backfill + Finalize

### Task 11: 기존 데이터 마이그레이션 + NOT NULL 적용

**Files:**
- Create: `drizzle/backfill-company-id.sql`

- [ ] **Step 1: Backfill SQL 작성**

```sql
-- Get korea company ID
DO $$
DECLARE
  korea_id UUID;
BEGIN
  SELECT id INTO korea_id FROM expenseone.companies WHERE slug = 'korea';

  -- Backfill expenses
  UPDATE expenseone.expenses SET company_id = korea_id WHERE company_id IS NULL;

  -- Backfill users
  UPDATE expenseone.users SET company_id = korea_id WHERE company_id IS NULL;

  -- Backfill departments
  UPDATE expenseone.departments SET company_id = korea_id WHERE company_id IS NULL;

  -- Verify no NULLs remain
  RAISE NOTICE 'Remaining NULL expenses: %', (SELECT count(*) FROM expenseone.expenses WHERE company_id IS NULL);
  RAISE NOTICE 'Remaining NULL users: %', (SELECT count(*) FROM expenseone.users WHERE company_id IS NULL);
  RAISE NOTICE 'Remaining NULL departments: %', (SELECT count(*) FROM expenseone.departments WHERE company_id IS NULL);
END $$;
```

- [ ] **Step 2: Backfill 실행**

```bash
psql "$SUPABASE_DB_URL" -f drizzle/backfill-company-id.sql
```

- [ ] **Step 3: NOT NULL 적용 (expenses, departments)**

schema.ts에서 `expenses.companyId`와 `departments.companyId`를 `.notNull()` 추가:

```typescript
companyId: uuid("company_id").notNull().references(() => companies.id),
```

```bash
npx drizzle-kit push
```

- [ ] **Step 4: 전체 타입 체크 + 빌드 테스트**

```bash
npx tsc --noEmit
npm run build
```

- [ ] **Step 5: 커밋**

```bash
git add drizzle/backfill-company-id.sql src/lib/db/schema.ts
git commit -m "feat: backfill company_id data + enforce NOT NULL constraints"
```

---

### Task 12: 최종 배포 + 환경변수 정리

- [ ] **Step 1: 한아원리테일 Slack 채널 ID 확인 및 DB 업데이트**

Slack에서 한아원리테일 expenses 채널 ID를 확인하고, companies 테이블에 업데이트.

- [ ] **Step 2: Vercel 배포**

```bash
git push origin main
npx vercel --prod
```

- [ ] **Step 3: Production 데이터 확인**

배포 후 확인 항목:
- [ ] 법카사용 제출 시 회사 선택 UI 표시
- [ ] 한아원코리아 비용 → 코리아 Slack 채널
- [ ] 한아원리테일 비용 → 리테일 Slack 채널
- [ ] 관리 대시보드 회사 필터 동작
- [ ] 기존 유저 로그인 시 회사 선택 모달
- [ ] 설정에서 소속 회사 변경 가능

- [ ] **Step 4: 커밋 (환경변수 정리 등)**

```bash
git commit -m "chore: finalize multi-company deployment"
```
