# ExpenseFlow Implementation Plan

## Status as of 2026-03-13

### Infrastructure
- Supabase project: `cqrpvswpnbuzxwznmokl` (ap-northeast-1, ACTIVE_HEALTHY)
- DB connection: Session-mode pooler at `aws-1-ap-northeast-1.pooler.supabase.com:5432`
- Schema: Fully deployed (users, expenses, attachments, notifications + enums + indexes)
- Drizzle ORM: Connected and synced (drizzle-kit push confirms "No changes detected")
- Dev server: Starts cleanly on port 3000

### Codebase Audit Summary

**Backend (API + Services): ~90% complete**
- All CRUD API routes implemented: expenses, attachments, notifications, admin dashboard, CSV export
- All services implemented: expense.service.ts (513 lines), attachment.service.ts (228 lines), notification.service.ts (250 lines), slack.service.ts (128 lines)
- Validation schemas: expense.ts, expense-form.ts (Zod)
- Auth middleware: Supabase SSR middleware with Google SSO callback
- Types: Full type definitions in types/index.ts

**Frontend (Pages + Components): ~85% complete**
- Dashboard home: Full implementation with summary cards, quick actions, recent expenses
- Expense list: Server-side data fetching, filtering, pagination, table + empty states
- Expense detail: Full view with timeline, attachments, edit/delete/cancel actions
- Corporate card form: Complete with Zod validation, file upload, calendar picker
- Deposit request form: Complete with required file upload + document type labels
- Admin pending approvals: Full table with approve/reject dialogs, mobile cards
- Admin dashboard: Charts (category breakdown, monthly trend, top submitters) with period filter
- Reports: Filters + CSV download
- Notifications: Full list with read/unread, mark-all-read, click-to-navigate
- Settings: Profile info display (read-only)
- Admin users: Page exists with users-table component
- Login: Page exists
- Layout: Sidebar + Header components, dashboard layout

**What is missing / broken (compile errors):**
1. `edit-expense-form.tsx` -- imported by edit page but file does not exist (only TS error)
2. `src/emails/` directory -- no email templates (React Email)
3. Supabase RLS policies -- not yet configured
4. Supabase Realtime subscription -- not yet wired on client
5. `buttonVariants({ size: "icon-sm" })` in expense detail -- may not exist in shadcn config (needs verification)

---

## Implementation Steps

### Step 1 (Priority): Fix Compile Error + Edit Form
**Goal:** Get to zero TypeScript errors and complete the core user editing flow.
**Estimated time:** 1-2 hours

#### Task 1.1: Create EditExpenseForm component
- **File:** `src/app/(dashboard)/expenses/[id]/edit/edit-expense-form.tsx`
- **Description:** Client component that renders an edit form pre-filled with existing expense data. Reuse the same form structure as corporate-card and deposit-request pages, but pre-populate fields and call `PATCH /api/expenses/[id]` on submit.
- **Acceptance criteria:**
  - Component renders without errors
  - Pre-fills all fields from the passed `expense` prop
  - Shows existing attachments from `existingAttachments` prop
  - Allows adding new attachments and removing existing ones
  - Calls PATCH endpoint and redirects to detail page on success
  - Handles corporate card vs deposit request field differences
  - `npx tsc --noEmit` passes with zero errors

**Agent:** Frontend Developer

#### Task 1.2: Verify PATCH /api/expenses/[id] route handles updates
- **File:** `src/app/api/expenses/[id]/route.ts`
- **Description:** Confirm the PATCH handler exists and supports all editable fields including attachment changes.
- **Acceptance criteria:** PATCH endpoint updates expense fields and returns updated data

**Agent:** Backend Architect (review only -- likely already implemented)

---

### Step 2: Admin Features Completion
**Goal:** Ensure admin flows work end-to-end.
**Estimated time:** 1-2 hours

#### Task 2.1: Verify admin users management page
- **File:** `src/app/(dashboard)/admin/users/page.tsx`, `users-table.tsx`
- **Description:** Review and test the admin users page. Ensure it lists users, allows role changes (MEMBER/ADMIN), and department updates. Wire to `GET/PATCH /api/admin/users`.
- **Acceptance criteria:**
  - Users table displays all users with name, email, role, department, status
  - Admin can change user role via dropdown
  - Admin can update department
  - Mobile responsive layout

**Agent:** Frontend Developer

#### Task 2.2: Verify admin dashboard API returns correct aggregated data
- **File:** `src/app/api/admin/dashboard/route.ts`
- **Description:** Test that the dashboard API correctly computes stats, category breakdown, monthly trend, and top submitters for each period filter.
- **Acceptance criteria:** API returns valid data for all period filters (this_month, 3_months, 6_months, this_year)

**Agent:** Backend Architect (review + fix if needed)

---

### Step 3: Supporting Features
**Goal:** Add email notifications, Realtime subscriptions, and RLS.
**Estimated time:** 3-4 hours

#### Task 3.1: Create React Email templates
- **Files to create:**
  - `src/emails/deposit-approved.tsx` -- Sent when admin approves a deposit request
  - `src/emails/deposit-rejected.tsx` -- Sent when admin rejects a deposit request
  - `src/emails/new-deposit-request.tsx` -- Sent to all admins when new deposit request submitted
- **Description:** Create email templates using @react-email/components. Each should include expense title, amount, requester name, and a link to the expense detail page.
- **Acceptance criteria:**
  - Templates render valid HTML
  - Include all relevant expense info
  - Link to expense detail page using NEXT_PUBLIC_APP_URL
  - Korean language

**Agent:** Frontend Developer

#### Task 3.2: Wire email sending in notification service
- **File:** `src/services/notification.service.ts`
- **Description:** Add Resend API calls to send emails when creating notifications. Import templates from Task 3.1.
- **Acceptance criteria:**
  - Email sent on deposit request approval
  - Email sent on deposit request rejection
  - Email sent to all admins on new deposit request submission
  - Graceful failure handling (email failure should not block the main operation)

**Agent:** Backend Architect

#### Task 3.3: Add Supabase Realtime subscription for notifications
- **Files:**
  - `src/hooks/use-realtime-notifications.ts` (new)
  - `src/components/layout/header.tsx` (modify -- add notification bell with unread count)
- **Description:** Subscribe to the notifications table for the current user using Supabase Realtime. Show unread count badge on the notification bell in the header. Play a sound or show a toast on new notification.
- **Acceptance criteria:**
  - Header shows notification bell with unread count
  - Count updates in real-time when new notification arrives
  - Clicking bell navigates to /notifications
  - Subscription properly cleaned up on unmount

**Agent:** Frontend Developer + Backend Architect (parallel)

#### Task 3.4: Configure Supabase RLS policies
- **Description:** Create Row Level Security policies for all tables:
  - `users`: Users can read own profile. Admins can read/update all users.
  - `expenses`: Users can CRUD own expenses. Admins can read all, update status.
  - `attachments`: Same as parent expense permissions.
  - `notifications`: Users can read/update own notifications only.
- **Execution:** Via Supabase Management API or SQL migration
- **Acceptance criteria:**
  - All tables have RLS enabled
  - MEMBER can only access own data
  - ADMIN has full read access, limited write access
  - Service role key bypasses RLS (for server-side operations)

**Agent:** Backend Architect

---

### Step 4: Polish and Production Readiness
**Goal:** Final quality pass before deployment.
**Estimated time:** 2-3 hours

#### Task 4.1: Mobile responsiveness audit
- **Description:** Review all pages on mobile viewport (375px width). Fix any overflow, truncation, or layout issues.
- **Acceptance criteria:** All pages usable on mobile without horizontal scroll

**Agent:** Frontend Developer

#### Task 4.2: Error handling and loading states
- **Description:** Ensure all pages handle auth errors (redirect to login), API errors (show toast), and loading states (skeleton/spinner).
- **Acceptance criteria:** No unhandled promise rejections. All async operations show loading indicator.

**Agent:** Frontend Developer

#### Task 4.3: Google SSO domain restriction
- **File:** `src/app/auth/callback/route.ts`, middleware
- **Description:** Verify that only `@ALLOWED_EMAIL_DOMAIN` emails can sign in. Reject others with clear error message.
- **Acceptance criteria:** Non-allowed domains see error. Allowed domains proceed normally.

**Agent:** Backend Architect

#### Task 4.4: Supabase Storage bucket setup
- **Description:** Create the `attachments` storage bucket in Supabase with appropriate policies (authenticated users can upload, file size limits).
- **Acceptance criteria:** File upload from expense forms works end-to-end

**Agent:** Backend Architect

---

## Parallel Execution Strategy

```
Step 1: [Frontend Developer: Task 1.1] + [Backend Architect: Task 1.2 review]
         |
         v
Step 2: [Frontend Developer: Task 2.1] + [Backend Architect: Task 2.2]
         |
         v
Step 3: [Frontend Developer: Tasks 3.1, 3.3] || [Backend Architect: Tasks 3.2, 3.4]
         |
         v
Step 4: [Frontend Developer: Tasks 4.1, 4.2] || [Backend Architect: Tasks 4.3, 4.4]
```

Steps within each phase can run in parallel where indicated with `||`.
Steps 1 through 4 are sequential (each builds on the previous).

## Technical Notes

- **DB Connection:** Uses session-mode pooler (`port 5432`) which supports prepared statements. The `db/index.ts` has `prepare: false` -- this is fine for compatibility but could be set to `true` for session mode if performance matters.
- **Drizzle config:** Now auto-loads `.env.local` via dotenv (added as devDependency).
- **Only 1 TS error:** Missing `edit-expense-form.tsx` -- this is the single blocking issue.
- **No RLS yet:** All data access currently relies on application-level checks (middleware + service layer). RLS adds defense-in-depth.
- **No emails directory:** React Email templates need to be created from scratch.
- **Middleware deprecation warning:** Next.js 16 shows "middleware file convention is deprecated, use proxy instead" -- non-blocking but should be addressed eventually.
