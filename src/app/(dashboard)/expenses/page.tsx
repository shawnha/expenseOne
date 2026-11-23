import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { SettlementReview } from "@/components/expenses/settlement-review";
import { ExpenseReviewNavigation, SettlementReviewLink } from "@/components/expenses/settlement-review-link";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import { ExpenseTable } from "@/components/expenses/expense-table";
import { Pagination } from "@/components/expenses/pagination";
import { PendingSection, RestListHeading } from "@/components/expenses/pending-section";
import { Plus, Repeat } from "lucide-react";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { expenseListPeriod } from "@/lib/expenses/list-period";
import { getCompanyExpenses, getExpenses } from "@/services/expense.service";
import { getSettlementCompanies } from "@/services/brand-settlement.service";
import { expenseQuerySchema, type ExpenseQueryInput } from "@/lib/validations/expense";

interface ExpensesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PAGE_SIZE = 20;
const PENDING_LIMIT = 100;

async function getExpensesData(
  searchParams: Awaited<ExpensesPageProps["searchParams"]>,
  user: NonNullable<Awaited<ReturnType<typeof getCachedCurrentUser>>>,
  companyView: boolean,
) {
  const type = expenseQuerySchema.shape.type.safeParse(searchParams.type).data;
  const status = expenseQuerySchema.shape.status.safeParse(searchParams.status).data;
  const category = typeof searchParams.category === "string" ? searchParams.category : undefined;
  const { startDate, endDate } = expenseListPeriod(searchParams);
  const search = typeof searchParams.search === "string" ? searchParams.search.slice(0, 200) : undefined;
  const company = companyView && typeof searchParams.company === "string" ? searchParams.company : undefined;
  const freelancer = searchParams.freelancer === "true" ? "true" : undefined;
  const prePaidParam = searchParams.prePaid;
  const prePaid =
    prePaidParam === "true" || prePaidParam === "remaining" ? prePaidParam : undefined;
  const pageStr = typeof searchParams.page === "string" ? searchParams.page : "1";
  const page = Math.max(1, parseInt(pageStr, 10) || 1);

  // 상태를 직접 고르면 나누지 않고 예전처럼 한 목록으로 보여 준다.
  const splitPending = !status && !companyView;
  const filters: Omit<ExpenseQueryInput, "page" | "limit"> & { includeRemainingPaymentDates: boolean } = {
    startDate,
    endDate,
    includeRemainingPaymentDates: true,
    type,
    category,
    search,
    company,
    freelancer,
    prePaid,
  };

  const QUERY_TIMEOUT_MS = 8000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listQuery = { ...filters, page, limit: PAGE_SIZE, status, pending: splitPending ? "exclude" as const : undefined };
  const [result, pendingResult] = await Promise.race([
    Promise.all([
      companyView ? getCompanyExpenses(listQuery, user.id) : getExpenses(listQuery, user.id, user.role),
      // 처리 대기는 선택한 기간 안에서 첫 페이지에 모은다.
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

  const toRow = (item: (typeof result.data)[number]) => ({
    id: item.id,
    type: item.type,
    status: item.status,
    title: item.title,
    amount: item.amount,
    currency: item.currency,
    amountOriginal: item.amountOriginal,
    category: item.category,
    createdAt: item.createdAt?.toISOString() ?? "",
    submitter: item.submitter ? { id: item.submitter.id, name: item.submitter.name } : null,
    companyName: companyView ? item.companyName : null,
    companySlug: companyView ? item.companySlug : null,
    isUrgent: item.isUrgent ?? false,
    isPrePaid: item.isPrePaid ?? false,
    prePaidPercentage: item.prePaidPercentage ?? null,
    prePaidFixedAmount: item.prePaidFixedAmount ?? null,
    hasFreelancerWithholding: item.hasFreelancerWithholding ?? false,
    remainingPaymentRequested: item.remainingPaymentRequested ?? false,
    remainingPaymentApproved: item.remainingPaymentApproved ?? false,
    remainingPaymentDates: item.remainingPaymentDates,
    dueDate: item.dueDate ?? null,
  });
  const expenses = result.data.map(toRow);

  return {
    expenses,
    meta: { page: result.meta.page, totalPages: result.meta.totalPages, total: result.meta.total },
    pending: pendingResult ? { expenses: pendingResult.data.map(toRow), total: pendingResult.meta.total } : null,
    splitPending,
  };
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const resolvedParams = await searchParams;
  if (resolvedParams.view === "settlements") return <SettlementReview params={resolvedParams} />;

  const user = await getCachedCurrentUser();
  if (!user) redirect("/login");
  const companyView = resolvedParams.view === "company";
  const companyOptions = companyView ? await getSettlementCompanies(user.id) : undefined;
  if (companyOptions?.length === 0) notFound();
  const { expenses, meta, pending, splitPending } = await getExpensesData(resolvedParams, user, companyView);
  const currentUserId = user.id;
  const hasPending = (pending?.expenses.length ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">비용 목록</h1>
          <p className="mt-0.5 break-keep text-footnote text-[var(--apple-secondary-label)]">
            {companyView ? "담당 법인의 비용을 조회하세요." : "제출한 비용 내역을 관리하세요."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/expenses/recurring"
            className="inline-flex items-center gap-1 rounded-full border border-[var(--apple-separator)] px-3 py-2 text-[13px] font-medium text-[var(--apple-secondary-label)] transition-colors hover:bg-[rgba(0,0,0,0.04)] apple-press"
          >
            <Repeat className="size-3.5" />
            반복 지급
          </Link>
          <Link
            href="/expenses/new"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[var(--apple-blue)] text-white text-sm font-medium rounded-full hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] transition-colors shadow-sm apple-press"
          >
            <Plus className="size-4" />
            새 비용
          </Link>
        </div>
      </div>

      <Suspense fallback={null}>
        {companyView ? <ExpenseReviewNavigation view="company" /> : <SettlementReviewLink userId={currentUserId} />}
      </Suspense>

      {/* Filters */}
      <Suspense fallback={<div className="h-10 animate-pulse rounded-xl glass-subtle" />}>
        <div className="animate-fade-up-1">
          <ExpenseFilters key={companyView ? "company" : "own"} companyOptions={companyOptions} />
        </div>
      </Suspense>

      {/* 처리 대기 */}
      {pending && <PendingSection expenses={pending.expenses} total={pending.total} currentUserId={currentUserId} />}
      {/* 2페이지부터는 위 칸이 없어도 아래 목록은 처리 대기를 뺀 것이라 머리를 그대로 단다. */}
      {splitPending && (hasPending || meta.page > 1) && <RestListHeading />}

      {/* Table or empty state */}
      {expenses.length === 0 && hasPending ? (
        <div className="glass flex flex-col items-center justify-center py-12 text-center animate-fade-up-3">
          <p className="text-sm text-[var(--apple-secondary-label)]">처리 대기 말고는 비용이 없습니다</p>
        </div>
      ) : expenses.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center py-12 text-center animate-fade-up-3">
          <p className="text-sm text-[var(--apple-secondary-label)]">{companyView ? "이 조건의 법인 비용이 없습니다" : "비용이 없습니다"}</p>
          {!companyView && <Link
            href="/expenses/new"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 glass text-sm font-medium text-[var(--apple-blue)] hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)] transition-colors apple-press"
          >
            <Plus className="size-4" />
            첫 비용 제출하기
          </Link>}
        </div>
      ) : (
        <>
          <div className="animate-fade-up-3">
            <ExpenseTable expenses={expenses} showSubmitter={companyView} currentUserId={currentUserId} readOnly={companyView} />
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
