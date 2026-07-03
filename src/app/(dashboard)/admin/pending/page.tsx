import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { getExpenses, getPendingRemainingPayments } from "@/services/expense.service";
import { AdminCompanyFilter } from "@/components/admin/company-filter";
import { ApproveRemainingButton } from "@/components/expenses/approve-remaining-button";
import { formatExpenseAmount } from "@/lib/utils/expense-utils";
import { PendingTable } from "./pending-table";
import type { PendingExpense } from "./pending-table";

// ---------------------------------------------------------------------------
// Server-side data fetching
// ---------------------------------------------------------------------------

interface PendingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function getPendingExpenses(company?: string): Promise<PendingExpense[]> {
  const user = await getCachedCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (user.role !== "ADMIN") {
    redirect("/");
  }

  const result = await getExpenses(
    {
      page: 1,
      limit: 100,
      type: "DEPOSIT_REQUEST",
      status: "SUBMITTED",
      company,
    },
    user.id,
    user.role,
    false, // ownOnly = false — admin sees all
  );

  return result.data.map((item) => ({
    id: item.id,
    title: item.title,
    amount: item.amount,
    category: item.category,
    createdAt: item.createdAt?.toISOString() ?? "",
    submitter: item.submitter
      ? { name: item.submitter.name, email: item.submitter.email }
      : null,
    attachmentCount: item.attachmentCount ?? 0,
    isUrgent: item.isUrgent ?? false,
    isPrePaid: item.isPrePaid ?? false,
    prePaidPercentage: item.prePaidPercentage ?? null,
    companyName: item.companyName ?? null,
    companySlug: item.companySlug ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Page (Server Component)
// ---------------------------------------------------------------------------

export default async function AdminPendingPage({ searchParams }: PendingPageProps) {
  const resolvedParams = await searchParams;
  const company = typeof resolvedParams.company === "string" ? resolvedParams.company : undefined;
  const [expenses, remainingPayments] = await Promise.all([
    getPendingExpenses(company),
    getPendingRemainingPayments(company),
  ]);

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-title3 text-[var(--apple-label)]">승인 대기</h1>
        <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">
          승인이 필요한 입금요청을 처리하세요.
        </p>
      </div>

      {/* Company Filter */}
      <Suspense fallback={null}>
        <div className="animate-fade-up">
          <AdminCompanyFilter paramName="company" />
        </div>
      </Suspense>

      {/* 후지급 승인 대기 — 부분 선지급 건의 잔금 지급 최종 승인 */}
      {remainingPayments.length > 0 && (
        <div className="glass p-3 sm:p-4 lg:p-5 animate-fade-up-1">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-subheadline font-semibold text-[var(--apple-label)]">후지급 승인 대기</h2>
            <span className="glass-badge glass-badge-orange animate-spring-pop">{remainingPayments.length}건</span>
          </div>

          <ul className="flex flex-col gap-2">
            {remainingPayments.map((item) => (
              <li
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 px-3.5 py-3 rounded-xl border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)]"
              >
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/expenses/${item.id}`}
                    className="text-sm font-medium text-[var(--apple-label)] hover:text-[var(--apple-blue)] transition-colors truncate block"
                  >
                    {item.title}
                  </Link>
                  <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">
                    {item.submitterName ?? "-"}
                    {item.companyName ? ` · ${item.companyName}` : ""}
                    {" · 총 "}
                    {formatExpenseAmount(item.amount, item.currency, item.amountOriginal)}
                    {` · 선지급 ${item.prePaidPercentage}% 완료`}
                    {item.dueDate ? ` · 기일 ${item.dueDate.replace(/-/g, ".")}` : ""}
                  </p>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span className="text-sm font-semibold tabular-nums text-[var(--apple-label)]">
                    후지급 {item.remainingAmount.toLocaleString("ko-KR")}원
                  </span>
                  <ApproveRemainingButton expenseId={item.id} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="glass p-3 sm:p-4 lg:p-5 animate-fade-up-1">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-subheadline font-semibold text-[var(--apple-label)]">대기 중인 요청</h2>
          {expenses.length > 0 && (
            <span className="glass-badge glass-badge-orange animate-spring-pop">{expenses.length}건</span>
          )}
        </div>

        <PendingTable expenses={expenses} />
      </div>
    </div>
  );
}
