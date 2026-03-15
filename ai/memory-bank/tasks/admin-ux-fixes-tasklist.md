# Admin UX Critical Fixes - Development Tasks

## Specification Summary

**User-Reported Issues:**
1. Dashboard "승인대기" card click does not navigate to approval list page
2. No page exists for admins to view all expenses (including approved ones)
3. `/expenses` page shows other users' expenses to admin -- admin should see only their own
4. Dashboard card links target pages that may not exist
5. Overall admin UX is inadequate

**Technical Stack:** Next.js 14 App Router, Supabase, Drizzle ORM, shadcn/ui, Tailwind CSS

---

## Issue Analysis

### Issue 1: Dashboard "승인대기" card links to wrong destination

**Current State (line 174 of `src/app/(dashboard)/page.tsx`):**
```
{ title: "승인 대기", value: `${pendingCount}건`, href: "/expenses?status=SUBMITTED" }
```

The "승인 대기" card links to `/expenses?status=SUBMITTED`. For ADMIN users, this should link to `/admin/pending` (the dedicated approval page), not the generic expenses list.

**Root Cause:** All four dashboard summary cards link to `/expenses` or `/expenses?status=...` regardless of user role. Admin-specific cards (승인 대기) should route to admin-specific pages.

### Issue 2: No "all expenses" page for admins

**Current State:** The admin section has:
- `/admin` -- dashboard with stats/charts (exists, works)
- `/admin/pending` -- pending approval list (exists, works)
- `/admin/reports` -- CSV export with filters (exists, works)
- `/admin/users` -- user management (exists, works)

**Missing:** No page where admin can browse ALL expenses (all statuses, all users) in a table format with filters. The `/admin/reports` page only shows summary counts and CSV download -- it does not display individual expense rows.

### Issue 3: `/expenses` shows all users' data to admin

**Current State (`src/services/expense.service.ts`, lines 126-128):**
```typescript
if (userRole === "MEMBER") {
  conditions.push(eq(expenses.submittedById, userId));
}
```

Only MEMBER role gets filtered to own expenses. ADMIN sees everything. Per business rules, `/expenses` is the user's personal expense management page -- even admins should see only their own submissions here.

### Issue 4: Dashboard card links may target nonexistent pages

**Current State (line 171-176 of `src/app/(dashboard)/page.tsx`):**
```
{ title: "이번 달 총 비용", value: ..., href: "/expenses" }           -- EXISTS
{ title: "제출 건수", value: ..., href: "/expenses" }                 -- EXISTS
{ title: "승인 대기", value: ..., href: "/expenses?status=SUBMITTED" } -- EXISTS but wrong target for admin
{ title: "승인 완료", value: ..., href: "/expenses?status=APPROVED" }  -- EXISTS but wrong target for admin
```

All linked pages exist. The issue is that for ADMIN users, the "승인 대기" card should go to `/admin/pending`, and the dashboard data itself shows ALL users' data when the admin views it, which is confusing on a personal dashboard.

### Issue 5: Dashboard shows ALL users' data for admin

**Current State (lines 64-137 of `src/app/(dashboard)/page.tsx`):**
The `getDashboardData()` function only filters by `submittedById` when `isMember` is true. For admins, the personal dashboard shows aggregated company-wide stats, which is confusing -- the personal dashboard should show personal stats, and the admin dashboard (`/admin`) should show company-wide stats.

---

## Development Tasks

### [ ] Task 1: Fix dashboard to show personal data only (HIGH PRIORITY)

**Description:** Modify `getDashboardData()` in the main dashboard page so that ALL users (including ADMIN) see only their own expenses on the home dashboard. The company-wide view already exists at `/admin`.

**Acceptance Criteria:**
- Admin's home dashboard shows only their own submitted expenses
- Stats (total amount, submitted count, pending count, approved count) reflect only the logged-in user's data
- Recent expenses list shows only the logged-in user's submissions
- No regression for MEMBER users

**Files to Edit:**
- `src/app/(dashboard)/page.tsx` -- Remove the `if (isMember)` conditionals so all queries always filter by `authUser.id`

**Implementation:**
1. In `getDashboardData()`, remove all `if (isMember) { ... }` blocks
2. Always add `.eq("submitted_by_id", authUser.id)` to every query
3. Remove the `userRole` variable and `isMember` check (not needed for personal dashboard)

**Estimated Time:** 15 minutes

---

### [ ] Task 2: Fix dashboard card links for ADMIN users (HIGH PRIORITY)

**Description:** Make the "승인 대기" dashboard card link to `/admin/pending` when the user is an ADMIN. Other cards should also route appropriately.

**Acceptance Criteria:**
- ADMIN: "승인 대기" card links to `/admin/pending`
- ADMIN: "승인 완료" card links to `/admin` (admin dashboard) or `/expenses?status=APPROVED` (own approved)
- MEMBER: All cards continue to link to `/expenses` variants (no change)
- Cards are clickable and navigate correctly

**Files to Edit:**
- `src/app/(dashboard)/page.tsx` -- Make `summaryCards` array conditional on `userRole`

**Implementation:**
1. Keep `userRole` from the fetch (needed for link routing)
2. Pass `userRole` to the component
3. Build `summaryCards` with role-conditional `href` values:
   - "승인 대기" for ADMIN: `/admin/pending`
   - Other cards: keep `/expenses?status=...` (now filtered to own data per Task 1)

**Estimated Time:** 15 minutes

**Dependency:** None (but logically pairs with Task 1)

---

### [ ] Task 3: Fix `/expenses` page to show only own expenses for all roles (HIGH PRIORITY)

**Description:** Modify the expense service's `getExpenses` function so that the `/expenses` page always shows only the current user's expenses, regardless of role. Admin's company-wide view should use a separate mechanism.

**Acceptance Criteria:**
- ADMIN visiting `/expenses` sees only their own submitted expenses
- MEMBER visiting `/expenses` sees only their own (unchanged behavior)
- Admin approval pages (`/admin/pending`) still see all users' SUBMITTED expenses
- Admin reports page still works with all data
- No regression in approve/reject functionality

**Files to Edit:**
- `src/services/expense.service.ts` -- Add a new parameter or modify `getExpenses` to distinguish between "personal view" and "admin view"

**Implementation Options (choose one):**

**Option A (Recommended): Add `viewMode` parameter**
1. Add optional `viewMode: "personal" | "admin"` parameter to `getExpenses`
2. When `viewMode === "personal"` or when role is MEMBER, always filter by `submittedById`
3. When `viewMode === "admin"`, show all expenses (for admin pages)
4. Update callers:
   - `src/app/(dashboard)/expenses/page.tsx` -- pass `viewMode: "personal"`
   - `src/app/api/expenses/route.ts` -- pass `viewMode: "personal"` (API used by the expenses list page)
   - `src/app/(dashboard)/admin/pending/page.tsx` -- uses API with `viewMode: "admin"` implicitly (it already fetches via `/api/expenses?type=DEPOSIT_REQUEST&status=SUBMITTED`)
   - `src/app/(dashboard)/admin/reports/page.tsx` -- uses API with admin context

**Option B: Separate API endpoint for admin**
Create `/api/admin/expenses` for admin-only full list, keep `/api/expenses` as personal-only.

**Estimated Time:** 30 minutes

**Dependency:** None

---

### [ ] Task 4: Create admin "all expenses" page (MEDIUM PRIORITY)

**Description:** Create a new page at `/admin/expenses` that shows ALL expenses from ALL users with full filtering capability (type, status, category, date range, submitter). This is the "전체 비용 목록" that admins need.

**Acceptance Criteria:**
- Page accessible at `/admin/expenses`
- Shows expenses from all users in a table
- Displays submitter name/email column
- Filter by: type, status, category, date range, search
- Pagination works
- Clicking a row navigates to expense detail (`/expenses/[id]`)
- Only accessible by ADMIN role
- Mobile responsive

**Files to Create:**
- `src/app/(dashboard)/admin/expenses/page.tsx`

**Files to Edit:**
- `src/components/layout/sidebar.tsx` -- Add "전체 비용" nav item to `adminNavItems`

**Implementation:**
1. Create a server component similar to `/expenses/page.tsx` but calling `getExpenses` with `viewMode: "admin"`
2. Reuse `ExpenseTable` component (it already has `showSubmitter` prop)
3. Reuse `ExpenseFilters` component
4. Reuse `Pagination` component
5. Add admin role check (redirect non-admins)
6. Add sidebar nav item: `{ label: "전체 비용", href: "/admin/expenses", icon: <Receipt /> }`

**Estimated Time:** 45 minutes

**Dependency:** Task 3 (needs viewMode parameter in getExpenses)

---

### [ ] Task 5: Add admin nav item for "전체 비용" in sidebar (LOW PRIORITY)

**Description:** Add navigation link for the new admin expenses page in the sidebar.

**Acceptance Criteria:**
- "전체 비용" appears in admin nav section of sidebar
- Active state highlights correctly when on `/admin/expenses`
- Appears between "승인 대기" and "리포트" in the nav order

**Files to Edit:**
- `src/components/layout/sidebar.tsx` -- Add to `adminNavItems` array

**Implementation:**
Add to `adminNavItems` at index 1 (after "대시보드"):
```typescript
{ label: "전체 비용", href: "/admin/expenses", icon: <Receipt className="size-[18px]" /> }
```

Import `Receipt` from lucide-react (already imported in the file context, just add to the import).

**Estimated Time:** 5 minutes

**Dependency:** Task 4 (page must exist for link to work)

---

### [ ] Task 6: Fix admin dashboard stat cards to link to admin pages (LOW PRIORITY)

**Description:** On the admin dashboard (`/admin`), the stat cards (총 비용, 승인 대기, 승인 완료, 반려) are not clickable. Make them link to relevant admin pages.

**Current State (`src/app/(dashboard)/admin/page.tsx`, lines 145-149):**
```typescript
const statCards = [
  { title: "총 비용", value: `${formatAmount(stats.totalAmount)}원` },
  { title: "승인 대기", value: `${stats.pendingCount}건` },
  { title: "승인 완료", value: `${stats.approvedCount}건` },
  { title: "반려", value: `${stats.rejectedCount}건` },
];
```

No `href` property -- cards are not links.

**Acceptance Criteria:**
- "총 비용" card links to `/admin/expenses`
- "승인 대기" card links to `/admin/pending`
- "승인 완료" card links to `/admin/expenses?status=APPROVED`
- "반려" card links to `/admin/expenses?status=REJECTED`
- Cards have hover/press states

**Files to Edit:**
- `src/app/(dashboard)/admin/page.tsx` -- Add `href` to statCards, wrap in `Link`

**Estimated Time:** 15 minutes

**Dependency:** Task 4 (admin expenses page must exist)

---

## Task Execution Order (Recommended)

```
Phase 1 - Critical data fixes (can be done in parallel):
  Task 1: Fix dashboard personal data filtering
  Task 3: Fix /expenses to show own expenses only

Phase 2 - Navigation fixes (depends on Phase 1):
  Task 2: Fix dashboard card links for ADMIN

Phase 3 - New admin page (depends on Task 3):
  Task 4: Create /admin/expenses page
  Task 5: Add sidebar nav item

Phase 4 - Polish:
  Task 6: Make admin dashboard cards clickable
```

## Quality Requirements
- [ ] All pages load without errors
- [ ] No TypeScript compilation errors (`npx tsc --noEmit`)
- [ ] No ESLint errors (`npm run lint`)
- [ ] Mobile responsive design maintained
- [ ] ADMIN can still approve/reject from `/admin/pending`
- [ ] MEMBER experience unchanged
- [ ] No background processes in any commands
- [ ] No server startup commands -- assume development server running

## Technical Notes

**Key Files Reference:**
- Dashboard: `src/app/(dashboard)/page.tsx`
- Expenses list: `src/app/(dashboard)/expenses/page.tsx`
- Expense service: `src/services/expense.service.ts`
- API route: `src/app/api/expenses/route.ts`
- Sidebar: `src/components/layout/sidebar.tsx`
- Admin dashboard: `src/app/(dashboard)/admin/page.tsx`
- Admin pending: `src/app/(dashboard)/admin/pending/page.tsx`
- Admin reports: `src/app/(dashboard)/admin/reports/page.tsx`
- Admin users: `src/app/(dashboard)/admin/users/page.tsx`

**Business Rules Reminder:**
- `/expenses` = personal expense management (both MEMBER and ADMIN see only their own)
- `/admin/*` = admin-only pages (company-wide view)
- CORPORATE_CARD: auto-approved on submission
- DEPOSIT_REQUEST: requires ADMIN approval (SUBMITTED -> APPROVED/REJECTED)
