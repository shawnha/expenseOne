import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { getExpenses } from "@/services/expense.service";
import { AdminCompanyFilter } from "@/components/admin/company-filter";
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
  const expenses = await getPendingExpenses(company);

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">승인 대기</h1>
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

      <div className="glass p-3 sm:p-4 lg:p-5 animate-fade-up-1">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">대기 중인 요청</h2>
          {expenses.length > 0 && (
            <span className="glass-badge glass-badge-orange animate-spring-pop">{expenses.length}건</span>
          )}
        </div>

        <PendingTable expenses={expenses} />
      </div>
    </div>
  );
}
