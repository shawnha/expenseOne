# Reports Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul `/admin/reports` into a comprehensive analytics hub with 7 chart types, period presets, and period-over-period comparison.

**Architecture:** Single API endpoint (`/api/admin/reports/data`) returns all chart data in one request. The page is a client component with filter state driving API calls. Charts are custom SVG (no external library), following existing dashboard patterns.

**Tech Stack:** Next.js App Router, Drizzle ORM (PostgreSQL), Custom SVG charts, Tailwind CSS, shadcn/ui

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/app/api/admin/reports/data/route.ts` | Reports data API — all 7 data sections in one endpoint |
| Rewrite | `src/app/(dashboard)/admin/reports/page.tsx` | Reports page — filters + summary + 6 chart sections |
| Create | `src/components/charts/report-line-chart.tsx` | Monthly trend line chart (SVG) |
| Create | `src/components/charts/report-donut-chart.tsx` | Category donut chart (SVG) |
| Create | `src/components/charts/report-stack-bar.tsx` | Type ratio stacked bar chart (SVG) |
| Create | `src/components/charts/report-dept-bar.tsx` | Department horizontal bar chart |
| Create | `src/components/charts/report-company-compare.tsx` | Company comparison card |
| Create | `src/components/charts/report-top-submitters.tsx` | Top 5 submitters horizontal list |
| Create | `src/components/reports/report-filters.tsx` | Filter bar: period presets + dropdowns |
| Create | `src/components/reports/report-summary-cards.tsx` | 4 summary cards with period comparison |
| Create | `src/lib/utils/report-periods.ts` | Period preset calculations (date ranges + comparison ranges) |

---

### Task 1: Period Utility Functions

**Files:**
- Create: `src/lib/utils/report-periods.ts`

- [ ] **Step 1: Create period utility file**

```typescript
// src/lib/utils/report-periods.ts

export type PeriodPreset =
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_3_months"
  | "last_6_months"
  | "this_year"
  | "custom";

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface PeriodInfo {
  current: DateRange;
  previous: DateRange; // same-length preceding period for comparison
  label: string;
}

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "this_month", label: "이번 달" },
  { value: "last_month", label: "지난 달" },
  { value: "this_quarter", label: "이번 분기" },
  { value: "last_3_months", label: "최근 3개월" },
  { value: "last_6_months", label: "최근 6개월" },
  { value: "this_year", label: "올해" },
  { value: "custom", label: "직접 입력" },
];

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0);
}

export function getPeriodDates(
  preset: PeriodPreset,
  customStart?: string,
  customEnd?: string,
): PeriodInfo {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  let current: DateRange;
  let previous: DateRange;
  let label: string;

  switch (preset) {
    case "this_month": {
      current = {
        startDate: formatDate(new Date(y, m, 1)),
        endDate: formatDate(now),
      };
      previous = {
        startDate: formatDate(new Date(y, m - 1, 1)),
        endDate: formatDate(lastDayOfMonth(y, m - 1)),
      };
      label = "전월 대비";
      break;
    }
    case "last_month": {
      current = {
        startDate: formatDate(new Date(y, m - 1, 1)),
        endDate: formatDate(lastDayOfMonth(y, m - 1)),
      };
      previous = {
        startDate: formatDate(new Date(y, m - 2, 1)),
        endDate: formatDate(lastDayOfMonth(y, m - 2)),
      };
      label = "전월 대비";
      break;
    }
    case "this_quarter": {
      const qStart = Math.floor(m / 3) * 3;
      current = {
        startDate: formatDate(new Date(y, qStart, 1)),
        endDate: formatDate(now),
      };
      previous = {
        startDate: formatDate(new Date(y, qStart - 3, 1)),
        endDate: formatDate(lastDayOfMonth(y, qStart - 1)),
      };
      label = "전분기 대비";
      break;
    }
    case "last_3_months": {
      current = {
        startDate: formatDate(new Date(y, m - 2, 1)),
        endDate: formatDate(now),
      };
      previous = {
        startDate: formatDate(new Date(y, m - 5, 1)),
        endDate: formatDate(lastDayOfMonth(y, m - 3)),
      };
      label = "전 3개월 대비";
      break;
    }
    case "last_6_months": {
      current = {
        startDate: formatDate(new Date(y, m - 5, 1)),
        endDate: formatDate(now),
      };
      previous = {
        startDate: formatDate(new Date(y, m - 11, 1)),
        endDate: formatDate(lastDayOfMonth(y, m - 6)),
      };
      label = "전 6개월 대비";
      break;
    }
    case "this_year": {
      current = {
        startDate: formatDate(new Date(y, 0, 1)),
        endDate: formatDate(now),
      };
      previous = {
        startDate: formatDate(new Date(y - 1, 0, 1)),
        endDate: formatDate(new Date(y - 1, 11, 31)),
      };
      label = "전년 대비";
      break;
    }
    case "custom": {
      const s = customStart ?? formatDate(new Date(y, m, 1));
      const e = customEnd ?? formatDate(now);
      current = { startDate: s, endDate: e };
      // Calculate previous period of same length
      const startD = new Date(s);
      const endD = new Date(e);
      const diff = endD.getTime() - startD.getTime();
      const prevEnd = new Date(startD.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - diff);
      previous = {
        startDate: formatDate(prevStart),
        endDate: formatDate(prevEnd),
      };
      label = "전기간 대비";
      break;
    }
  }

  return { current, previous, label };
}

export function calcChangePercent(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}
```

- [ ] **Step 2: Verify file compiles**

Run: `cd /Users/admin/Desktop/claude/claude_1/expense-app && npx tsc --noEmit src/lib/utils/report-periods.ts 2>&1 | head -20`
Expected: No errors (or only unrelated errors from other files)

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils/report-periods.ts
git commit -m "feat(reports): add period utility functions for date range presets and comparison"
```

---

### Task 2: Reports Data API

**Files:**
- Create: `src/app/api/admin/reports/data/route.ts`

- [ ] **Step 1: Create the reports data API endpoint**

```typescript
// src/app/api/admin/reports/data/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { expenses, users, companies } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, sum, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = request.nextUrl;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const prevStartDate = searchParams.get("prevStartDate");
    const prevEndDate = searchParams.get("prevEndDate");
    const type = searchParams.get("type");
    const companyId = searchParams.get("companyId");
    const department = searchParams.get("department");
    const category = searchParams.get("category");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "startDate와 endDate는 필수입니다." } },
        { status: 400 },
      );
    }

    // Build base conditions (filters applied to current period)
    function buildConditions(start: string, end: string) {
      const conds: ReturnType<typeof eq>[] = [
        gte(expenses.transactionDate, start),
        lte(expenses.transactionDate, end),
      ];
      if (type && type !== "ALL") {
        conds.push(eq(expenses.type, type as "CORPORATE_CARD" | "DEPOSIT_REQUEST"));
      }
      if (companyId && companyId !== "ALL") {
        conds.push(eq(expenses.companyId, companyId));
      }
      if (category && category !== "ALL") {
        conds.push(eq(expenses.category, category));
      }
      return conds;
    }

    const currentConds = buildConditions(startDate, endDate);
    const currentWhere = and(...currentConds);

    // Department filter needs join, apply separately
    const needsDeptFilter = department && department !== "ALL";

    // ---- 1. Summary stats (current period) ----
    const summaryQuery = db
      .select({
        totalAmount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
        totalCount: sql<number>`count(*)::int`,
        approvedCount: sql<number>`count(*) filter (where ${expenses.status} = 'APPROVED')::int`,
        corporateCardCount: sql<number>`count(*) filter (where ${expenses.type} = 'CORPORATE_CARD')::int`,
        depositRequestCount: sql<number>`count(*) filter (where ${expenses.type} = 'DEPOSIT_REQUEST')::int`,
        corporateCardAmount: sql<number>`coalesce(sum(${expenses.amount}) filter (where ${expenses.type} = 'CORPORATE_CARD'), 0)::int`,
        depositRequestAmount: sql<number>`coalesce(sum(${expenses.amount}) filter (where ${expenses.type} = 'DEPOSIT_REQUEST'), 0)::int`,
      })
      .from(expenses);

    if (needsDeptFilter) {
      summaryQuery.innerJoin(users, eq(expenses.submittedById, users.id));
      currentConds.push(eq(users.department, department!) as ReturnType<typeof eq>);
    }

    const [summaryResult] = await summaryQuery.where(and(...currentConds));

    // ---- 2. Summary stats (previous period for comparison) ----
    let prevSummary = { totalAmount: 0, approvedCount: 0, totalCount: 0, corporateCardCount: 0, depositRequestCount: 0 };
    if (prevStartDate && prevEndDate) {
      const prevConds = buildConditions(prevStartDate, prevEndDate);
      const prevQuery = db
        .select({
          totalAmount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
          totalCount: sql<number>`count(*)::int`,
          approvedCount: sql<number>`count(*) filter (where ${expenses.status} = 'APPROVED')::int`,
          corporateCardCount: sql<number>`count(*) filter (where ${expenses.type} = 'CORPORATE_CARD')::int`,
          depositRequestCount: sql<number>`count(*) filter (where ${expenses.type} = 'DEPOSIT_REQUEST')::int`,
        })
        .from(expenses);

      if (needsDeptFilter) {
        prevQuery.innerJoin(users, eq(expenses.submittedById, users.id));
        prevConds.push(eq(users.department, department!) as ReturnType<typeof eq>);
      }

      const [prev] = await prevQuery.where(and(...prevConds));
      if (prev) prevSummary = prev;
    }

    // ---- 3. Monthly trend ----
    const trendConds = [...buildConditions(startDate, endDate)];
    const trendQuery = db
      .select({
        month: sql<string>`to_char(${expenses.transactionDate}::date, 'YYYY-MM')`,
        amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
      })
      .from(expenses);

    if (needsDeptFilter) {
      trendQuery.innerJoin(users, eq(expenses.submittedById, users.id));
      trendConds.push(eq(users.department, department!) as ReturnType<typeof eq>);
    }

    const monthlyTrend = await trendQuery
      .where(and(...trendConds))
      .groupBy(sql`to_char(${expenses.transactionDate}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${expenses.transactionDate}::date, 'YYYY-MM') asc`);

    // ---- 4. Category breakdown ----
    const catConds = [...buildConditions(startDate, endDate)];
    const catQuery = db
      .select({
        category: expenses.category,
        amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(expenses);

    if (needsDeptFilter) {
      catQuery.innerJoin(users, eq(expenses.submittedById, users.id));
      catConds.push(eq(users.department, department!) as ReturnType<typeof eq>);
    }

    const categoryBreakdown = await catQuery
      .where(and(...catConds))
      .groupBy(expenses.category)
      .orderBy(sql`sum(${expenses.amount}) desc`);

    // ---- 5. Type ratio by month ----
    const typeConds = [...buildConditions(startDate, endDate)];
    const typeQuery = db
      .select({
        month: sql<string>`to_char(${expenses.transactionDate}::date, 'YYYY-MM')`,
        corporateCard: sql<number>`coalesce(sum(${expenses.amount}) filter (where ${expenses.type} = 'CORPORATE_CARD'), 0)::int`,
        depositRequest: sql<number>`coalesce(sum(${expenses.amount}) filter (where ${expenses.type} = 'DEPOSIT_REQUEST'), 0)::int`,
      })
      .from(expenses);

    if (needsDeptFilter) {
      typeQuery.innerJoin(users, eq(expenses.submittedById, users.id));
      typeConds.push(eq(users.department, department!) as ReturnType<typeof eq>);
    }

    const typeRatio = await typeQuery
      .where(and(...typeConds))
      .groupBy(sql`to_char(${expenses.transactionDate}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${expenses.transactionDate}::date, 'YYYY-MM') asc`);

    // ---- 6. Department breakdown ----
    const deptConds = [...buildConditions(startDate, endDate)];
    const departmentBreakdown = await db
      .select({
        department: users.department,
        amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(expenses)
      .innerJoin(users, eq(expenses.submittedById, users.id))
      .where(and(...deptConds))
      .groupBy(users.department)
      .orderBy(sql`sum(${expenses.amount}) desc`);

    // ---- 7. Company comparison ----
    const companyConds = [...buildConditions(startDate, endDate)];
    // Remove companyId filter for comparison
    const companyComparison = await db
      .select({
        companyId: expenses.companyId,
        name: companies.name,
        slug: companies.slug,
        amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(expenses)
      .innerJoin(companies, eq(expenses.companyId, companies.id))
      .where(
        and(
          gte(expenses.transactionDate, startDate),
          lte(expenses.transactionDate, endDate),
          // Apply type/category/dept filters but NOT companyId
          ...(type && type !== "ALL"
            ? [eq(expenses.type, type as "CORPORATE_CARD" | "DEPOSIT_REQUEST")]
            : []),
          ...(category && category !== "ALL"
            ? [eq(expenses.category, category)]
            : []),
        ),
      )
      .groupBy(expenses.companyId, companies.name, companies.slug)
      .orderBy(sql`sum(${expenses.amount}) desc`);

    // ---- 8. Top 5 submitters ----
    const topConds = [...buildConditions(startDate, endDate)];
    const topSubmitters = await db
      .select({
        userId: users.id,
        name: users.name,
        profileImageUrl: users.profileImageUrl,
        amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(expenses)
      .innerJoin(users, eq(expenses.submittedById, users.id))
      .where(and(...topConds))
      .groupBy(users.id, users.name, users.profileImageUrl)
      .orderBy(sql`sum(${expenses.amount}) desc`)
      .limit(5);

    // ---- Build response ----
    const totalAmount = summaryResult?.totalAmount ?? 0;
    const totalCount = summaryResult?.totalCount ?? 0;
    const approvedCount = summaryResult?.approvedCount ?? 0;
    const ccCount = summaryResult?.corporateCardCount ?? 0;
    const drCount = summaryResult?.depositRequestCount ?? 0;
    const ccAmount = summaryResult?.corporateCardAmount ?? 0;
    const drAmount = summaryResult?.depositRequestAmount ?? 0;

    const totalForRatio = ccAmount + drAmount;
    const corporateCardRatio = totalForRatio > 0 ? Math.round((ccAmount / totalForRatio) * 100) : 0;
    const depositRequestRatio = totalForRatio > 0 ? 100 - corporateCardRatio : 0;

    return NextResponse.json({
      data: {
        summary: {
          totalAmount,
          totalCount,
          approvedCount,
          averageAmount: totalCount > 0 ? Math.round(totalAmount / totalCount) : 0,
          corporateCardRatio,
          depositRequestRatio,
        },
        comparison: {
          totalAmount: prevSummary.totalAmount,
          approvedCount: prevSummary.approvedCount,
          totalCount: prevSummary.totalCount,
          averageAmount:
            prevSummary.totalCount > 0
              ? Math.round(prevSummary.totalAmount / prevSummary.totalCount)
              : 0,
          corporateCardRatio:
            prevSummary.corporateCardCount + prevSummary.depositRequestCount > 0
              ? Math.round(
                  (prevSummary.corporateCardCount /
                    (prevSummary.corporateCardCount + prevSummary.depositRequestCount)) *
                    100,
                )
              : 0,
        },
        monthlyTrend: monthlyTrend.map((m) => ({
          month: m.month,
          label: `${parseInt(m.month?.split("-")[1] ?? "0")}월`,
          amount: m.amount,
        })),
        categoryBreakdown: categoryBreakdown.map((c) => {
          const totalCat = categoryBreakdown.reduce((sum, item) => sum + item.amount, 0);
          return {
            category: c.category,
            amount: c.amount,
            count: c.count,
            percentage: totalCat > 0 ? Math.round((c.amount / totalCat) * 100) : 0,
          };
        }),
        typeRatio: typeRatio.map((t) => {
          const total = t.corporateCard + t.depositRequest;
          return {
            month: t.month,
            label: `${parseInt(t.month?.split("-")[1] ?? "0")}월`,
            corporateCard: total > 0 ? Math.round((t.corporateCard / total) * 100) : 0,
            depositRequest: total > 0 ? Math.round((t.depositRequest / total) * 100) : 0,
            corporateCardAmount: t.corporateCard,
            depositRequestAmount: t.depositRequest,
          };
        }),
        departmentBreakdown: departmentBreakdown.map((d) => ({
          department: d.department ?? "미지정",
          amount: d.amount,
          count: d.count,
        })),
        companyComparison: companyComparison.map((c) => ({
          companyId: c.companyId,
          name: c.name,
          slug: c.slug,
          amount: c.amount,
          count: c.count,
        })),
        topSubmitters: topSubmitters.map((s) => ({
          userId: s.userId,
          name: s.name,
          profileImageUrl: s.profileImageUrl,
          amount: s.amount,
          count: s.count,
        })),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
```

- [ ] **Step 2: Verify the API compiles**

Run: `cd /Users/admin/Desktop/claude/claude_1/expense-app && npx tsc --noEmit 2>&1 | grep "reports/data" | head -10`
Expected: No errors in the new file

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/reports/data/route.ts
git commit -m "feat(reports): add comprehensive reports data API endpoint"
```

---

### Task 3: Chart Components

**Files:**
- Create: `src/components/charts/report-line-chart.tsx`
- Create: `src/components/charts/report-donut-chart.tsx`
- Create: `src/components/charts/report-stack-bar.tsx`
- Create: `src/components/charts/report-dept-bar.tsx`
- Create: `src/components/charts/report-company-compare.tsx`
- Create: `src/components/charts/report-top-submitters.tsx`

- [ ] **Step 1: Create the line chart component**

```tsx
// src/components/charts/report-line-chart.tsx
"use client";

import { formatAmount } from "@/lib/validations/expense-form";

interface DataPoint {
  month: string;
  label: string;
  amount: number;
}

export function ReportLineChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--apple-secondary-label)]">
        데이터가 없습니다
      </p>
    );
  }

  const maxAmount = Math.max(...data.map((d) => d.amount), 1);
  const padding = { top: 10, right: 10, bottom: 24, left: 10 };
  const width = 500;
  const height = 140;
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = data.map((d, i) => ({
    x: padding.left + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW),
    y: padding.top + chartH - (d.amount / maxAmount) * chartH,
    ...d,
  }));

  // Smooth cubic bezier path
  let linePath = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    linePath += ` C${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
  }

  const areaPath = `${linePath} L${points[points.length - 1].x},${padding.top + chartH} L${points[0].x},${padding.top + chartH} Z`;

  return (
    <div className="border border-[var(--apple-separator)] rounded-xl p-4">
      <h3 className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">
        월별 비용 추이
      </h3>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="월별 비용 추이 차트">
        <defs>
          <linearGradient id="report-line-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--apple-blue)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--apple-blue)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <line
            key={r}
            x1={padding.left}
            y1={padding.top + chartH * (1 - r)}
            x2={width - padding.right}
            y2={padding.top + chartH * (1 - r)}
            stroke="var(--apple-separator)"
            strokeWidth="0.5"
            strokeDasharray={r === 0 ? "0" : "2,2"}
          />
        ))}
        {/* Area */}
        <path d={areaPath} fill="url(#report-line-grad)" />
        {/* Line */}
        <path d={linePath} fill="none" stroke="var(--apple-blue)" strokeWidth="2" strokeLinecap="round" />
        {/* Data points */}
        {points.map((p) => (
          <circle key={p.month} cx={p.x} cy={p.y} r="3" fill="var(--apple-blue)" />
        ))}
        {/* X-axis labels */}
        {points.map((p) => (
          <text
            key={`label-${p.month}`}
            x={p.x}
            y={height - 4}
            textAnchor="middle"
            fontSize="9"
            fill="var(--apple-secondary-label)"
          >
            {p.label}
          </text>
        ))}
        {/* Value labels on points */}
        {points.map((p) => (
          <text
            key={`val-${p.month}`}
            x={p.x}
            y={p.y - 8}
            textAnchor="middle"
            fontSize="8"
            fontWeight="600"
            fill="var(--apple-label)"
          >
            {p.amount >= 1_000_000
              ? `${(p.amount / 1_000_000).toFixed(1)}M`
              : p.amount >= 1_000
                ? `${(p.amount / 1_000).toFixed(0)}K`
                : `${p.amount}`}
          </text>
        ))}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Create the donut chart component**

```tsx
// src/components/charts/report-donut-chart.tsx
"use client";

import { getCategoryLabel } from "@/lib/utils/expense-utils";
import { formatAmount } from "@/lib/validations/expense-form";

interface CategoryData {
  category: string;
  amount: number;
  count: number;
  percentage: number;
}

const COLORS = [
  "var(--apple-blue)",
  "var(--apple-green)",
  "var(--apple-orange)",
  "var(--apple-purple)",
  "var(--apple-red)",
  "var(--apple-teal)",
];

export function ReportDonutChart({ data }: { data: CategoryData[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--apple-secondary-label)]">
        데이터가 없습니다
      </p>
    );
  }

  const total = data.reduce((s, d) => s + d.amount, 0);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const segments = data.map((d, i) => {
    const pct = total > 0 ? d.amount / total : 0;
    const dash = pct * circumference;
    const seg = { ...d, color: COLORS[i % COLORS.length], dash, offset: -offset };
    offset += dash;
    return seg;
  });

  return (
    <div className="border border-[var(--apple-separator)] rounded-xl p-4">
      <h3 className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">
        카테고리별 비중
      </h3>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 100 100" className="w-20 h-20 shrink-0" role="img" aria-label="카테고리별 비중 차트">
          {segments.map((seg) => (
            <circle
              key={seg.category}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="10"
              strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
              strokeDashoffset={seg.offset}
              transform="rotate(-90 50 50)"
            />
          ))}
          <text x="50" y="53" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--apple-label)">
            {data.length}개
          </text>
        </svg>
        <div className="flex flex-col gap-1.5 min-w-0">
          {segments.map((seg) => (
            <div key={seg.category} className="flex items-center gap-2 text-xs">
              <span
                className="shrink-0 size-2 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              <span className="truncate text-[var(--apple-label)]">
                {getCategoryLabel(seg.category)}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--apple-secondary-label)]">
                {seg.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the stacked bar chart component**

```tsx
// src/components/charts/report-stack-bar.tsx
"use client";

interface TypeRatioData {
  month: string;
  label: string;
  corporateCard: number;
  depositRequest: number;
}

export function ReportStackBar({ data }: { data: TypeRatioData[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--apple-secondary-label)]">
        데이터가 없습니다
      </p>
    );
  }

  return (
    <div className="border border-[var(--apple-separator)] rounded-xl p-4">
      <h3 className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">
        법카 vs 입금요청 비율
      </h3>
      <div className="flex flex-col gap-2.5">
        {data.map((d) => (
          <div key={d.month}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[var(--apple-secondary-label)]">{d.label}</span>
              <span className="text-[10px] tabular-nums text-[var(--apple-secondary-label)]">
                {d.corporateCard}% : {d.depositRequest}%
              </span>
            </div>
            <div className="h-3 flex rounded-md overflow-hidden">
              <div
                className="bg-[var(--apple-blue)] transition-all duration-500"
                style={{ width: `${d.corporateCard}%` }}
              />
              <div
                className="bg-[var(--apple-orange)] transition-all duration-500"
                style={{ width: `${d.depositRequest}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-3 text-[11px] text-[var(--apple-secondary-label)]">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-[var(--apple-blue)]" />
          법카
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-[var(--apple-orange)]" />
          입금요청
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the department bar chart component**

```tsx
// src/components/charts/report-dept-bar.tsx
"use client";

import { formatAmount } from "@/lib/validations/expense-form";

interface DeptData {
  department: string;
  amount: number;
  count: number;
}

const BAR_COLORS = [
  "var(--apple-blue)",
  "var(--apple-purple)",
  "var(--apple-green)",
  "var(--apple-orange)",
  "var(--apple-teal)",
  "var(--apple-red)",
];

export function ReportDeptBar({ data }: { data: DeptData[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--apple-secondary-label)]">
        데이터가 없습니다
      </p>
    );
  }

  const maxAmount = Math.max(...data.map((d) => d.amount), 1);

  return (
    <div className="border border-[var(--apple-separator)] rounded-xl p-4">
      <h3 className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">
        부서별 비용
      </h3>
      <div className="flex flex-col gap-3">
        {data.map((item, idx) => {
          const pct = (item.amount / maxAmount) * 100;
          return (
            <div key={item.department}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[var(--apple-label)]">
                    {item.department}
                  </span>
                  <span className="text-[11px] text-[var(--apple-secondary-label)] tabular-nums">
                    {item.count}건
                  </span>
                </div>
                <span className="text-[13px] font-semibold tabular-nums text-[var(--apple-label)]">
                  {formatAmount(item.amount)}원
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[rgba(0,0,0,0.04)] dark:bg-[rgba(255,255,255,0.06)]">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: BAR_COLORS[idx % BAR_COLORS.length],
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create the company comparison component**

```tsx
// src/components/charts/report-company-compare.tsx
"use client";

import { formatAmount } from "@/lib/validations/expense-form";

interface CompanyData {
  companyId: string;
  name: string;
  slug: string;
  amount: number;
  count: number;
}

const SLUG_COLORS: Record<string, string> = {
  korea: "var(--apple-blue)",
  retail: "var(--apple-purple)",
};

export function ReportCompanyCompare({ data }: { data: CompanyData[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--apple-secondary-label)]">
        데이터가 없습니다
      </p>
    );
  }

  return (
    <div className="border border-[var(--apple-separator)] rounded-xl p-4">
      <h3 className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">
        회사별 비교
      </h3>
      <div className="flex items-center justify-around">
        {data.map((company, idx) => (
          <div key={company.companyId} className="flex items-center gap-3">
            {idx > 0 && (
              <span className="text-sm text-[var(--apple-separator)] mr-3">vs</span>
            )}
            <div className="text-center">
              <div className="text-[11px] text-[var(--apple-secondary-label)] mb-1">
                {company.name}
              </div>
              <div
                className="text-lg font-bold tabular-nums"
                style={{ color: SLUG_COLORS[company.slug] ?? "var(--apple-label)" }}
              >
                {formatAmount(company.amount)}원
              </div>
              <div className="text-[11px] text-[var(--apple-secondary-label)] tabular-nums">
                {company.count}건
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create the top submitters component**

```tsx
// src/components/charts/report-top-submitters.tsx
"use client";

import { formatAmount } from "@/lib/validations/expense-form";

interface SubmitterData {
  userId: string;
  name: string;
  profileImageUrl: string | null;
  amount: number;
  count: number;
}

const AVATAR_COLORS = [
  "var(--apple-blue)",
  "var(--apple-purple)",
  "var(--apple-green)",
  "var(--apple-orange)",
  "var(--apple-red)",
];

export function ReportTopSubmitters({ data }: { data: SubmitterData[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--apple-secondary-label)]">
        데이터가 없습니다
      </p>
    );
  }

  return (
    <div className="border border-[var(--apple-separator)] rounded-xl p-4">
      <h3 className="text-[13px] font-semibold text-[var(--apple-label)] mb-3">
        Top {data.length} 제출자
      </h3>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {data.map((s, idx) => (
          <div key={s.userId} className="flex flex-col items-center min-w-[56px]">
            {s.profileImageUrl ? (
              <img
                src={s.profileImageUrl}
                alt={s.name}
                className="size-10 rounded-full object-cover mb-1"
              />
            ) : (
              <div
                className="size-10 rounded-full flex items-center justify-center text-white text-sm font-semibold mb-1"
                style={{ backgroundColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
              >
                {s.name.charAt(0)}
              </div>
            )}
            <span className="text-[11px] font-medium text-[var(--apple-label)] truncate max-w-[60px]">
              {s.name}
            </span>
            <span className="text-[10px] tabular-nums text-[var(--apple-secondary-label)]">
              {s.amount >= 1_000_000
                ? `${(s.amount / 1_000_000).toFixed(1)}M`
                : formatAmount(s.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify all chart components compile**

Run: `cd /Users/admin/Desktop/claude/claude_1/expense-app && npx tsc --noEmit 2>&1 | grep "charts/report" | head -20`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/components/charts/report-line-chart.tsx src/components/charts/report-donut-chart.tsx src/components/charts/report-stack-bar.tsx src/components/charts/report-dept-bar.tsx src/components/charts/report-company-compare.tsx src/components/charts/report-top-submitters.tsx
git commit -m "feat(reports): add 6 chart components for reports page"
```

---

### Task 4: Filter and Summary Components

**Files:**
- Create: `src/components/reports/report-filters.tsx`
- Create: `src/components/reports/report-summary-cards.tsx`

- [ ] **Step 1: Create the filter bar component**

```tsx
// src/components/reports/report-filters.tsx
"use client";

import { useState } from "react";
import { Download, Filter, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CATEGORY_OPTIONS } from "@/lib/validations/expense-form";
import { PERIOD_PRESETS, type PeriodPreset } from "@/lib/utils/report-periods";
import type { ExpenseType } from "@/types";

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface FilterValues {
  period: PeriodPreset;
  customStart: string;
  customEnd: string;
  type: ExpenseType | "ALL";
  companyId: string;
  department: string;
  category: string;
}

interface ReportFiltersProps {
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  companies: Company[];
  departments: string[];
  onDownloadCsv: () => void;
  downloading: boolean;
}

const TYPE_OPTIONS: { value: ExpenseType | "ALL"; label: string }[] = [
  { value: "ALL", label: "전체 유형" },
  { value: "CORPORATE_CARD", label: "법카사용" },
  { value: "DEPOSIT_REQUEST", label: "입금요청" },
];

export function ReportFilters({
  values,
  onChange,
  companies,
  departments,
  onDownloadCsv,
  downloading,
}: ReportFiltersProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const update = (partial: Partial<FilterValues>) => {
    onChange({ ...values, ...partial });
  };

  const activeFilterCount = [
    values.type !== "ALL",
    values.companyId !== "ALL",
    values.department !== "ALL",
    values.category !== "ALL",
  ].filter(Boolean).length;

  const categoryOptions = [
    { value: "ALL", label: "전체 카테고리" },
    ...CATEGORY_OPTIONS,
  ];

  const companyOptions = [
    { value: "ALL", label: "전체 회사" },
    ...companies.map((c) => ({ value: c.id, label: c.name })),
  ];

  const deptOptions = [
    { value: "ALL", label: "전체 부서" },
    ...departments.map((d) => ({ value: d, label: d })),
  ];

  // Period presets (pill buttons)
  const PeriodPills = () => (
    <div className="flex flex-wrap gap-1.5">
      {PERIOD_PRESETS.map((p) => (
        <button
          key={p.value}
          onClick={() => update({ period: p.value })}
          className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors apple-press ${
            values.period === p.value
              ? "bg-[var(--apple-blue)] text-white"
              : "bg-[var(--apple-fill)] text-[var(--apple-secondary-label)] hover:bg-[var(--apple-secondary-fill)]"
          } ${p.value === "custom" && values.period !== "custom" ? "border border-dashed border-[var(--apple-separator)]" : ""}`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );

  // Custom date range (only shown when "custom" is selected)
  const CustomDates = () =>
    values.period === "custom" ? (
      <div className="flex gap-2 items-center mt-2">
        <Input
          type="date"
          value={values.customStart}
          onChange={(e) => update({ customStart: e.target.value })}
          className="w-auto text-xs"
          aria-label="시작일"
        />
        <span className="text-[var(--apple-secondary-label)] text-xs">~</span>
        <Input
          type="date"
          value={values.customEnd}
          onChange={(e) => update({ customEnd: e.target.value })}
          className="w-auto text-xs"
          aria-label="종료일"
        />
      </div>
    ) : null;

  // Dropdown filters (desktop: inline, mobile: in sheet)
  const DropdownFilters = () => (
    <div className="flex flex-wrap gap-2">
      <Select value={values.type} onValueChange={(v) => update({ type: v as ExpenseType | "ALL" })}>
        <SelectTrigger className="w-auto min-w-[110px] text-xs h-8" aria-label="비용 유형">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={values.companyId} onValueChange={(v) => update({ companyId: v })}>
        <SelectTrigger className="w-auto min-w-[110px] text-xs h-8" aria-label="회사">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {companyOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={values.department} onValueChange={(v) => update({ department: v })}>
        <SelectTrigger className="w-auto min-w-[100px] text-xs h-8" aria-label="부서">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {deptOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={values.category} onValueChange={(v) => update({ category: v })}>
        <SelectTrigger className="w-auto min-w-[110px] text-xs h-8" aria-label="카테고리">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {categoryOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="glass p-4 sm:p-5">
      {/* Period presets */}
      <PeriodPills />
      <CustomDates />

      {/* Desktop: inline filters */}
      <div className="hidden sm:flex items-center gap-2 mt-3">
        <DropdownFilters />
        <Button
          onClick={onDownloadCsv}
          disabled={downloading}
          size="sm"
          className="ml-auto rounded-full h-8 px-4 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] text-xs"
        >
          {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          CSV
        </Button>
      </div>

      {/* Mobile: filter button + sheet */}
      <div className="flex sm:hidden items-center gap-2 mt-3">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 rounded-full text-xs gap-1.5">
              <Filter className="size-3.5" />
              필터
              {activeFilterCount > 0 && (
                <span className="bg-[var(--apple-blue)] text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>필터</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-3 mt-4 pb-6">
              <DropdownFilters />
              <Button
                onClick={() => setSheetOpen(false)}
                className="rounded-full h-11 bg-[var(--apple-blue)]"
              >
                적용
              </Button>
            </div>
          </SheetContent>
        </Sheet>
        <Button
          onClick={onDownloadCsv}
          disabled={downloading}
          size="sm"
          className="ml-auto rounded-full h-8 px-4 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] text-xs"
        >
          {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          CSV
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the summary cards component**

```tsx
// src/components/reports/report-summary-cards.tsx
"use client";

import { formatAmount } from "@/lib/validations/expense-form";
import { calcChangePercent } from "@/lib/utils/report-periods";

interface SummaryData {
  totalAmount: number;
  totalCount: number;
  approvedCount: number;
  averageAmount: number;
  corporateCardRatio: number;
  depositRequestRatio: number;
}

interface ReportSummaryCardsProps {
  current: SummaryData;
  previous: {
    totalAmount: number;
    approvedCount: number;
    totalCount: number;
    averageAmount: number;
    corporateCardRatio: number;
  };
  comparisonLabel: string;
}

function ChangeIndicator({ current, previous, label }: { current: number; previous: number; label: string }) {
  const change = calcChangePercent(current, previous);
  if (change === null) return <span className="text-[11px] text-[var(--apple-secondary-label)]">—</span>;

  const isPositive = change > 0;
  const isNeutral = change === 0;
  const color = isNeutral
    ? "text-[var(--apple-secondary-label)]"
    : isPositive
      ? "text-[var(--apple-green)]"
      : "text-[var(--apple-red)]";
  const arrow = isNeutral ? "—" : isPositive ? "▲" : "▼";

  return (
    <span className={`text-[11px] tabular-nums ${color}`}>
      {arrow} {Math.abs(change)}% {label}
    </span>
  );
}

const CARDS = [
  {
    label: "총 비용",
    bg: "bg-[rgba(0,122,255,0.05)] dark:bg-[rgba(0,122,255,0.1)]",
    color: "text-[var(--apple-blue)]",
    getValue: (d: SummaryData) => `${formatAmount(d.totalAmount)}원`,
    getCurrent: (d: SummaryData) => d.totalAmount,
    getPrevious: (p: ReportSummaryCardsProps["previous"]) => p.totalAmount,
  },
  {
    label: "승인 건수",
    bg: "bg-[rgba(52,199,89,0.05)] dark:bg-[rgba(52,199,89,0.1)]",
    color: "text-[var(--apple-green)]",
    getValue: (d: SummaryData) => `${d.approvedCount}건`,
    getCurrent: (d: SummaryData) => d.approvedCount,
    getPrevious: (p: ReportSummaryCardsProps["previous"]) => p.approvedCount,
  },
  {
    label: "평균 금액",
    bg: "bg-[rgba(255,149,0,0.05)] dark:bg-[rgba(255,149,0,0.1)]",
    color: "text-[var(--apple-orange)]",
    getValue: (d: SummaryData) => `${formatAmount(d.averageAmount)}원`,
    getCurrent: (d: SummaryData) => d.averageAmount,
    getPrevious: (p: ReportSummaryCardsProps["previous"]) => p.averageAmount,
  },
  {
    label: "법카:입금",
    bg: "bg-[rgba(88,86,214,0.05)] dark:bg-[rgba(88,86,214,0.1)]",
    color: "text-[var(--apple-purple)]",
    getValue: (d: SummaryData) => `${d.corporateCardRatio}:${d.depositRequestRatio}`,
    getCurrent: (d: SummaryData) => d.corporateCardRatio,
    getPrevious: (p: ReportSummaryCardsProps["previous"]) => p.corporateCardRatio,
  },
];

export function ReportSummaryCards({ current, previous, comparisonLabel }: ReportSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {CARDS.map((card, idx) => (
        <div
          key={card.label}
          className={`${card.bg} rounded-xl p-3 sm:p-4 text-center animate-card-enter`}
          style={{ animationDelay: `${idx * 50}ms` }}
        >
          <p className="text-[11px] text-[var(--apple-secondary-label)]">{card.label}</p>
          <p className={`text-lg sm:text-xl font-bold tabular-nums mt-1 ${card.color}`}>
            {card.getValue(current)}
          </p>
          <ChangeIndicator
            current={card.getCurrent(current)}
            previous={card.getPrevious(previous)}
            label={comparisonLabel}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify filter and summary components compile**

Run: `cd /Users/admin/Desktop/claude/claude_1/expense-app && npx tsc --noEmit 2>&1 | grep -E "report-filters|report-summary" | head -10`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/reports/report-filters.tsx src/components/reports/report-summary-cards.tsx
git commit -m "feat(reports): add filter bar and summary cards components"
```

---

### Task 5: Rewrite Reports Page

**Files:**
- Rewrite: `src/app/(dashboard)/admin/reports/page.tsx`

- [ ] **Step 1: Rewrite the reports page with all components**

```tsx
// src/app/(dashboard)/admin/reports/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportSummaryCards } from "@/components/reports/report-summary-cards";
import { ReportLineChart } from "@/components/charts/report-line-chart";
import { ReportDonutChart } from "@/components/charts/report-donut-chart";
import { ReportStackBar } from "@/components/charts/report-stack-bar";
import { ReportDeptBar } from "@/components/charts/report-dept-bar";
import { ReportCompanyCompare } from "@/components/charts/report-company-compare";
import { ReportTopSubmitters } from "@/components/charts/report-top-submitters";
import { getPeriodDates, type PeriodPreset } from "@/lib/utils/report-periods";
import type { ExpenseType } from "@/types";

interface FilterValues {
  period: PeriodPreset;
  customStart: string;
  customEnd: string;
  type: ExpenseType | "ALL";
  companyId: string;
  department: string;
  category: string;
}

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface ReportData {
  summary: {
    totalAmount: number;
    totalCount: number;
    approvedCount: number;
    averageAmount: number;
    corporateCardRatio: number;
    depositRequestRatio: number;
  };
  comparison: {
    totalAmount: number;
    approvedCount: number;
    totalCount: number;
    averageAmount: number;
    corporateCardRatio: number;
  };
  monthlyTrend: { month: string; label: string; amount: number }[];
  categoryBreakdown: { category: string; amount: number; count: number; percentage: number }[];
  typeRatio: { month: string; label: string; corporateCard: number; depositRequest: number }[];
  departmentBreakdown: { department: string; amount: number; count: number }[];
  companyComparison: { companyId: string; name: string; slug: string; amount: number; count: number }[];
  topSubmitters: { userId: string; name: string; profileImageUrl: string | null; amount: number; count: number }[];
}

export default function AdminReportsPage() {
  const [filters, setFilters] = useState<FilterValues>({
    period: "this_month",
    customStart: "",
    customEnd: "",
    type: "ALL",
    companyId: "ALL",
    department: "ALL",
    category: "ALL",
  });

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  // Fetch companies and departments for filter dropdowns
  useEffect(() => {
    async function fetchMeta() {
      try {
        const [compRes, deptRes] = await Promise.all([
          fetch("/api/companies"),
          fetch("/api/companies/departments"),
        ]);
        if (compRes.ok) {
          const json = await compRes.json();
          setCompanies(json.data ?? []);
        }
        if (deptRes.ok) {
          const json = await deptRes.json();
          setDepartments(json.data ?? []);
        }
      } catch {
        // silently fail — filters just won't have options
      }
    }
    fetchMeta();
  }, []);

  // Fetch report data whenever filters change
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const periodInfo = getPeriodDates(
        filters.period,
        filters.customStart || undefined,
        filters.customEnd || undefined,
      );

      const params = new URLSearchParams({
        startDate: periodInfo.current.startDate,
        endDate: periodInfo.current.endDate,
        prevStartDate: periodInfo.previous.startDate,
        prevEndDate: periodInfo.previous.endDate,
      });

      if (filters.type !== "ALL") params.set("type", filters.type);
      if (filters.companyId !== "ALL") params.set("companyId", filters.companyId);
      if (filters.department !== "ALL") params.set("department", filters.department);
      if (filters.category !== "ALL") params.set("category", filters.category);

      const res = await fetch(`/api/admin/reports/data?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // CSV download
  const handleDownloadCsv = async () => {
    setDownloading(true);
    try {
      const periodInfo = getPeriodDates(
        filters.period,
        filters.customStart || undefined,
        filters.customEnd || undefined,
      );
      const params = new URLSearchParams({
        startDate: periodInfo.current.startDate,
        endDate: periodInfo.current.endDate,
      });
      if (filters.type !== "ALL") params.set("type", filters.type);
      if (filters.category !== "ALL") params.set("category", filters.category);

      const res = await fetch(`/api/export/csv?${params.toString()}`);
      if (!res.ok) throw new Error("다운로드 실패");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition");
      a.download = cd?.match(/filename="?(.+?)"?$/)?.[1] ?? `expenses_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("CSV 다운로드에 실패했습니다.");
    } finally {
      setDownloading(false);
    }
  };

  const periodInfo = getPeriodDates(
    filters.period,
    filters.customStart || undefined,
    filters.customEnd || undefined,
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-title3 text-[var(--apple-label)]">리포트</h1>
        <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">
          비용 분석 대시보드
        </p>
      </div>

      {/* Filters */}
      <div className="animate-fade-up-1">
        <ReportFilters
          values={filters}
          onChange={setFilters}
          companies={companies}
          departments={departments}
          onDownloadCsv={handleDownloadCsv}
          downloading={downloading}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-[var(--apple-blue)]" />
        </div>
      ) : !data ? (
        <div className="glass p-8 text-center">
          <p className="text-sm text-[var(--apple-secondary-label)]">데이터를 불러오지 못했습니다.</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <ReportSummaryCards
            current={data.summary}
            previous={data.comparison}
            comparisonLabel={periodInfo.label}
          />

          {/* Monthly Trend (full-width) */}
          <div className="animate-fade-up-1">
            <ReportLineChart data={data.monthlyTrend} />
          </div>

          {/* Category + Type Ratio (2-col desktop, 1-col mobile) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="animate-fade-up-1">
              <ReportDonutChart data={data.categoryBreakdown} />
            </div>
            <div className="animate-fade-up-1">
              <ReportStackBar data={data.typeRatio} />
            </div>
          </div>

          {/* Department + Company (2-col desktop, 1-col mobile) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="animate-fade-up-1">
              <ReportDeptBar data={data.departmentBreakdown} />
            </div>
            <div className="animate-fade-up-1">
              <ReportCompanyCompare data={data.companyComparison} />
            </div>
          </div>

          {/* Top Submitters (full-width) */}
          <div className="animate-fade-up-1">
            <ReportTopSubmitters data={data.topSubmitters} />
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the page compiles**

Run: `cd /Users/admin/Desktop/claude/claude_1/expense-app && npx tsc --noEmit 2>&1 | grep "admin/reports" | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/admin/reports/page.tsx
git commit -m "feat(reports): rewrite reports page with comprehensive analytics dashboard"
```

---

### Task 6: Companies & Departments API Endpoints

The reports page needs `/api/companies` and `/api/companies/departments` endpoints for filter dropdowns. Check if they exist; if not, create them.

**Files:**
- Create (if needed): `src/app/api/companies/route.ts`
- Create (if needed): `src/app/api/companies/departments/route.ts`

- [ ] **Step 1: Check if company list API exists**

Run: `ls /Users/admin/Desktop/claude/claude_1/expense-app/src/app/api/companies/route.ts 2>/dev/null && echo "EXISTS" || echo "MISSING"`

If EXISTS, read it to check it returns `{ data: Company[] }`. If it returns a different format, adapt the reports page to match.

- [ ] **Step 2: Create departments list API if missing**

Check: `ls /Users/admin/Desktop/claude/claude_1/expense-app/src/app/api/companies/departments/route.ts 2>/dev/null && echo "EXISTS" || echo "MISSING"`

If MISSING, create:

```typescript
// src/app/api/companies/departments/route.ts

import { NextResponse } from "next/server";
import { requireAdmin, handleError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    await requireAdmin();

    const rows = await db
      .selectDistinct({ department: users.department })
      .from(users)
      .where(sql`${users.department} is not null and ${users.department} != ''`)
      .orderBy(users.department);

    const data = rows.map((r) => r.department).filter(Boolean) as string[];

    return NextResponse.json({ data });
  } catch (err) {
    return handleError(err);
  }
}
```

- [ ] **Step 3: Verify and commit**

Run: `cd /Users/admin/Desktop/claude/claude_1/expense-app && npx tsc --noEmit 2>&1 | grep "departments" | head -5`

```bash
git add src/app/api/companies/departments/route.ts
git commit -m "feat(reports): add departments list API for report filters"
```

---

### Task 7: Integration Test & Visual Verification

- [ ] **Step 1: Run the full type check**

Run: `cd /Users/admin/Desktop/claude/claude_1/expense-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run lint**

Run: `cd /Users/admin/Desktop/claude/claude_1/expense-app && npm run lint`
Expected: No errors

- [ ] **Step 3: Start dev server and verify page loads**

Run: `cd /Users/admin/Desktop/claude/claude_1/expense-app && npm run dev`
Navigate to `http://localhost:3000/admin/reports` and verify:
- Filter pills render and are clickable
- Summary cards show with change indicators
- All 6 chart sections render (even with empty data)
- Mobile responsive layout works (resize browser)

- [ ] **Step 4: Fix any issues found during verification**

Address compile errors, runtime errors, or visual issues.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix(reports): address integration issues from visual verification"
```

---

### Task 8: Deploy to Vercel

- [ ] **Step 1: Push to main and deploy**

Run: `cd /Users/admin/Desktop/claude/claude_1/expense-app && git push`

- [ ] **Step 2: Verify Vercel deployment succeeds**

Check Vercel dashboard or run: `npx vercel ls` to confirm deployment.

- [ ] **Step 3: Verify production reports page**

Navigate to the production URL `/admin/reports` and confirm all features work.
