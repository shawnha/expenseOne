import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import { ExpenseTable } from "@/components/expenses/expense-table";
import { Pagination } from "@/components/expenses/pagination";
import { PendingSection, RestListHeading } from "@/components/expenses/pending-section";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { getExpenses } from "@/services/expense.service";
import { AdminCompanyFilter } from "@/components/admin/company-filter";
import type { ExpenseQueryInput } from "@/lib/validations/expense";

interface AdminExpensesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PAGE_SIZE = 20;
const PENDING_LIMIT = 100;

async function getAdminExpensesData(searchParams: Record<string, string | string[] | undefined>) {
  const user = await getCachedCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (user.role !== "ADMIN") {
    redirect("/");
  }

  // Parse params
  const type = typeof searchParams.type === "string" ? searchParams.type : undefined;
  const status = typeof searchParams.status === "string" ? searchParams.status : undefined;
  const category = typeof searchParams.category === "string" ? searchParams.category : undefined;
  const startDate = typeof searchParams.startDate === "string" ? searchParams.startDate : undefined;
  const endDate = typeof searchParams.endDate === "string" ? searchParams.endDate : undefined;
  const search = typeof searchParams.search === "string" ? searchParams.search : undefined;
  const company = typeof searchParams.company === "string" ? searchParams.company : undefined;
  const autoClassifiedParam = typeof searchParams.autoClassified === "string" ? searchParams.autoClassified : undefined;
  const autoClassified =
    autoClassifiedParam === "auto" || autoClassifiedParam === "manual" || autoClassifiedParam === "all"
      ? (autoClassifiedParam as "all" | "auto" | "manual")
      : undefined;
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
    company,
    autoClassified,
    freelancer,
    prePaid,
  };
  const [result, pendingResult] = await Promise.all([
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
      false,
    ),
    // 처리 대기는 기간과 상관없이 모은다(올린 날과 입금할 날이 달라 뒤 페이지에 묻히던 건). 첫 페이지에만.
    splitPending && page === 1
      ? getExpenses({ ...filters, page: 1, limit: PENDING_LIMIT, pending: "only" }, user.id, user.role, false)
      : null,
  ]);

  const toRow = (item: (typeof result.data)[number]) => ({
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
    splitPending,
    currentUserId: user.id,
  };
}

export default async function AdminExpensesPage({ searchParams }: AdminExpensesPageProps) {
  const resolvedParams = await searchParams;
  const { expenses, meta, pending, splitPending, currentUserId } = await getAdminExpensesData(resolvedParams);
  const hasPending = (pending?.expenses.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">전체 비용</h1>
          <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">
            모든 팀원의 비용 내역을 조회하세요.
          </p>
        </div>
      </div>

      {/* Company Filter */}
      <Suspense fallback={null}>
        <div className="animate-fade-up">
          <AdminCompanyFilter paramName="company" />
        </div>
      </Suspense>

      {/* Filters */}
      <Suspense fallback={<div className="h-10 animate-pulse rounded-xl glass-subtle" />}>
        <div className="animate-fade-up-1">
          <ExpenseFilters showAdminFilters />
        </div>
      </Suspense>

      {/* 처리 대기 — 기간과 상관없이 맨 위에 */}
      {pending && (
        <PendingSection expenses={pending.expenses} total={pending.total} isAdmin currentUserId={currentUserId} />
      )}
      {/* 2페이지부터는 위 칸이 없어도 아래 목록은 처리 대기를 뺀 것이라 머리를 그대로 단다. */}
      {splitPending && (hasPending || meta.page > 1) && <RestListHeading />}

      {/* Table or empty state */}
      {expenses.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center py-12 text-center animate-fade-up-3">
          <p className="text-sm text-[var(--apple-secondary-label)]">
            {hasPending ? "처리 대기 말고는 비용이 없습니다" : "비용이 없습니다"}
          </p>
        </div>
      ) : (
        <>
          <div className="animate-fade-up-3">
            <ExpenseTable expenses={expenses} showSubmitter={true} isAdmin={true} currentUserId={currentUserId} />
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
