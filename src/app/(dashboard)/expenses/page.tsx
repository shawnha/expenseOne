import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import { ExpenseTable } from "@/components/expenses/expense-table";
import { Pagination } from "@/components/expenses/pagination";
import { PendingSection, RestListHeading } from "@/components/expenses/pending-section";
import { Plus } from "lucide-react";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { getExpenses } from "@/services/expense.service";
import type { ExpenseType, ExpenseStatus } from "@/types";
import type { ExpenseQueryInput } from "@/lib/validations/expense";

interface ExpensesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PAGE_SIZE = 20;
const PENDING_LIMIT = 100;

async function getExpensesData(searchParams: Record<string, string | string[] | undefined>) {
  const user = await getCachedCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Parse params
  const type = typeof searchParams.type === "string" ? searchParams.type : undefined;
  const status = typeof searchParams.status === "string" ? searchParams.status : undefined;
  const category = typeof searchParams.category === "string" ? searchParams.category : undefined;
  const startDate = typeof searchParams.startDate === "string" ? searchParams.startDate : undefined;
  const endDate = typeof searchParams.endDate === "string" ? searchParams.endDate : undefined;
  const search = typeof searchParams.search === "string" ? searchParams.search : undefined;
  const freelancer = searchParams.freelancer === "true" ? "true" : undefined;
  const prePaidParam = searchParams.prePaid;
  const prePaid =
    prePaidParam === "true" || prePaidParam === "remaining" ? prePaidParam : undefined;
  const pageStr = typeof searchParams.page === "string" ? searchParams.page : "1";
  const page = Math.max(1, parseInt(pageStr, 10) || 1);

  // 상태를 직접 고르면 나누지 않고 예전처럼 한 목록으로 보여 준다.
  const splitPending = !status;
  const filters: Omit<ExpenseQueryInput, "page" | "limit"> = {
    type: type as "CORPORATE_CARD" | "DEPOSIT_REQUEST" | "REFUND" | undefined,
    category,
    search,
    freelancer,
    prePaid,
  };

  const QUERY_TIMEOUT_MS = 8000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const [result, pendingResult] = await Promise.race([
    Promise.all([
      getExpenses(
        {
          ...filters,
          page,
          limit: PAGE_SIZE,
          status: status as "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED" | undefined,
          startDate,
          endDate,
          pending: splitPending ? "exclude" : undefined,
        },
        user.id,
        user.role,
      ),
      // 처리 대기는 기간과 상관없이 모은다(올린 날과 입금받을 날이 달라 뒤 페이지에 묻히던 건). 첫 페이지에만.
      splitPending && page === 1
        ? getExpenses({ ...filters, page: 1, limit: PENDING_LIMIT, pending: "only" }, user.id, user.role)
        : null,
    ]),
    new Promise<[
      {
        data: never[];
        meta: { page: number; totalPages: number; total: number };
        totalAmount: number;
      },
      null,
    ]>((resolve) => {
      timer = setTimeout(() => {
        console.error("[ExpensesPage] query timeout, falling back to empty");
        resolve([
          {
            data: [],
            meta: { page: 1, totalPages: 0, total: 0 },
            totalAmount: 0,
          },
          null,
        ]);
      }, QUERY_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer)); // 쿼리가 먼저 끝나면 뒤늦은 "timeout" 오탐 로그를 막는다(레이아웃과 같은 방식).

  const toRow = (item: NonNullable<typeof pendingResult>["data"][number]) => ({
    id: item.id,
    type: item.type as ExpenseType,
    status: item.status as ExpenseStatus,
    title: item.title,
    amount: item.amount,
    category: item.category,
    createdAt: item.createdAt?.toISOString() ?? "",
    submitter: item.submitter ?? null,
    isUrgent: item.isUrgent ?? false,
    isPrePaid: item.isPrePaid ?? false,
    prePaidPercentage: item.prePaidPercentage ?? null,
    prePaidFixedAmount: item.prePaidFixedAmount ?? null,
    hasFreelancerWithholding: item.hasFreelancerWithholding ?? false,
    remainingPaymentRequested: item.remainingPaymentRequested ?? false,
    remainingPaymentApproved: item.remainingPaymentApproved ?? false,
    dueDate: item.dueDate ?? null,
  });
  const expenses = result.data.map(toRow);

  return {
    expenses,
    meta: { page: result.meta.page, totalPages: result.meta.totalPages, total: result.meta.total },
    pending: pendingResult ? { expenses: pendingResult.data.map(toRow), total: pendingResult.meta.total } : null,
    currentUserId: user.id,
    userRole: user.role,
  };
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const resolvedParams = await searchParams;
  const { expenses, meta, pending, currentUserId } = await getExpensesData(resolvedParams);
  const hasPending = (pending?.expenses.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">비용 목록</h1>
          <p className="text-footnote text-[var(--apple-secondary-label)] mt-0.5">
            제출한 비용 내역을 관리하세요.
          </p>
        </div>
        <Link
          href="/expenses/new"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[var(--apple-blue)] text-white text-sm font-medium rounded-full hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] transition-colors shadow-sm apple-press"
        >
          <Plus className="size-4" />
          새 비용
        </Link>
      </div>

      {/* Filters */}
      <Suspense fallback={<div className="h-10 animate-pulse rounded-xl glass-subtle" />}>
        <div className="animate-fade-up-1">
          <ExpenseFilters />
        </div>
      </Suspense>

      {/* 처리 대기 — 기간과 상관없이 맨 위에 */}
      {pending && <PendingSection expenses={pending.expenses} total={pending.total} currentUserId={currentUserId} />}
      {hasPending && <RestListHeading />}

      {/* Table or empty state */}
      {expenses.length === 0 && hasPending ? (
        <div className="glass flex flex-col items-center justify-center py-12 text-center animate-fade-up-2">
          <p className="text-sm text-[var(--apple-secondary-label)]">처리 대기 말고는 비용이 없습니다</p>
        </div>
      ) : expenses.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center py-12 text-center animate-fade-up-2">
          <p className="text-sm text-[var(--apple-secondary-label)]">비용이 없습니다</p>
          <Link
            href="/expenses/new"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 glass text-sm font-medium text-[var(--apple-blue)] hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)] transition-colors apple-press"
          >
            <Plus className="size-4" />
            첫 비용 제출하기
          </Link>
        </div>
      ) : (
        <>
          <div className="animate-fade-up-2">
            <ExpenseTable expenses={expenses} showSubmitter={false} currentUserId={currentUserId} />
          </div>
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
          />
        </>
      )}
    </div>
  );
}
