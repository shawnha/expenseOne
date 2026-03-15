import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";
import { ExpenseFilters } from "@/components/expenses/expense-filters";
import { ExpenseTable } from "@/components/expenses/expense-table";
import { Pagination } from "@/components/expenses/pagination";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/api-utils";
import { getExpenses } from "@/services/expense.service";

interface ExpensesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PAGE_SIZE = 20;

async function getExpensesData(searchParams: Record<string, string | string[] | undefined>) {
  const user = await getCurrentUser();
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
  const pageStr = typeof searchParams.page === "string" ? searchParams.page : "1";
  const page = Math.max(1, parseInt(pageStr, 10) || 1);

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
    },
    user.id,
    user.role,
  );

  const expenses = result.data.map((item) => ({
    id: item.id,
    type: item.type,
    status: item.status,
    title: item.title,
    amount: item.amount,
    category: item.category,
    createdAt: item.createdAt?.toISOString() ?? "",
    submitter: item.submitter ?? null,
  }));

  return {
    expenses,
    meta: { page: result.meta.page, totalPages: result.meta.totalPages, total: result.meta.total },
    userRole: user.role,
  };
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const resolvedParams = await searchParams;
  const { expenses, meta, userRole } = await getExpensesData(resolvedParams);
  const isAdmin = userRole === "ADMIN";

  return (
    <div className="flex flex-col gap-5">
      {/* Page header */}
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">비용 목록</h1>
          <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">
            제출한 비용 내역을 관리하세요.
          </p>
        </div>
        <Link
          href="/expenses/new"
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#007AFF] text-white text-sm font-medium rounded-lg hover:bg-[#0066d6] transition-colors shadow-sm apple-press"
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

      {/* Table or empty state */}
      {expenses.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center py-12 text-center animate-fade-up-2">
          <p className="text-sm text-[var(--apple-secondary-label)]">비용이 없습니다</p>
          <Link
            href="/expenses/new"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 glass text-sm font-medium text-[#007AFF] hover:bg-[rgba(0,0,0,0.05)] transition-colors apple-press"
          >
            <Plus className="size-4" />
            첫 비용 제출하기
          </Link>
        </div>
      ) : (
        <>
          <div className="animate-fade-up-2">
            <ExpenseTable expenses={expenses as never[]} showSubmitter={false} />
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
