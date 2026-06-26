import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Download, Users, FileText, Wallet, AlertTriangle } from "lucide-react";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { getFreelancerWithholdingSummary } from "@/services/expense.service";
import { getPeriodDates } from "@/lib/utils/report-periods";
import { formatKRW, formatExpenseAmount } from "@/lib/utils/expense-utils";
import { AdminCompanyFilter } from "@/components/admin/company-filter";
import { FreelancerFilters } from "@/components/admin/freelancer-filters";

interface FreelancersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  SUBMITTED: { label: "제출", className: "glass-badge glass-badge-blue" },
  APPROVED: { label: "승인", className: "glass-badge glass-badge-green" },
};

const TYPE_LABELS: Record<string, string> = {
  CORPORATE_CARD: "법카",
  DEPOSIT_REQUEST: "입금요청",
};

function formatDate(ymd: string): string {
  return ymd.replaceAll("-", ".");
}

async function getData(searchParams: Record<string, string | string[] | undefined>) {
  const user = await getCachedCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/");

  const startParam = typeof searchParams.startDate === "string" ? searchParams.startDate : undefined;
  const endParam = typeof searchParams.endDate === "string" ? searchParams.endDate : undefined;
  const period = typeof searchParams.period === "string" ? searchParams.period : "this_year";
  const company = typeof searchParams.company === "string" ? searchParams.company : undefined;

  // 기본값: 올해 (연간 사업소득 신고 기준). period=all 이면 기간 제한 없음.
  let startDate = startParam;
  let endDate = endParam;
  if (!startDate && !endDate && period !== "all") {
    const { current } = getPeriodDates("this_year");
    startDate = current.startDate;
    endDate = current.endDate;
  }

  const summary = await getFreelancerWithholdingSummary({ startDate, endDate, company });

  return { summary, startDate, endDate, company };
}

export default async function FreelancersPage({ searchParams }: FreelancersPageProps) {
  const resolvedParams = await searchParams;
  const { summary, startDate, endDate, company } = await getData(resolvedParams);
  const { groups, totals } = summary;

  // CSV 내보내기 링크 (회계팀 전달용) — 기존 export 라우트의 freelancer 필터 재사용
  const csvParams = new URLSearchParams({ freelancer: "true", activeOnly: "true" });
  if (startDate) csvParams.set("startDate", startDate);
  if (endDate) csvParams.set("endDate", endDate);
  if (company) csvParams.set("company", company);
  const csvHref = `/api/export/csv?${csvParams.toString()}`;

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">사업소득 대상</h1>
          <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">
            프리랜서 원천징수로 표시된 비용을 예금주(사업소득자)별로 모았습니다.
          </p>
        </div>
        {totals.expenseCount > 0 && (
          <a
            href={csvHref}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 glass text-sm font-medium text-[var(--apple-blue)] rounded-full hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.06)] transition-colors apple-press shrink-0"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">CSV 내보내기</span>
          </a>
        )}
      </div>

      {/* Company filter */}
      <Suspense fallback={null}>
        <div className="animate-fade-up">
          <AdminCompanyFilter paramName="company" />
        </div>
      </Suspense>

      {/* Period filter */}
      <Suspense fallback={<div className="h-12 animate-pulse rounded-xl glass-subtle" />}>
        <div className="animate-fade-up-1">
          <FreelancerFilters />
        </div>
      </Suspense>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3 animate-fade-up-1">
        <div className="glass p-4 flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-footnote text-[var(--apple-secondary-label)]">
            <Users className="size-3.5" /> 대상 인원
          </span>
          <span className="text-title3 text-[var(--apple-label)] tabular-nums">
            {totals.peopleCount}
            <span className="text-base text-[var(--apple-secondary-label)] ml-0.5">명</span>
          </span>
        </div>
        <div className="glass p-4 flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-footnote text-[var(--apple-secondary-label)]">
            <FileText className="size-3.5" /> 총 건수
          </span>
          <span className="text-title3 text-[var(--apple-label)] tabular-nums">
            {totals.expenseCount}
            <span className="text-base text-[var(--apple-secondary-label)] ml-0.5">건</span>
          </span>
        </div>
        <div className="glass p-4 flex flex-col gap-1">
          <span className="inline-flex items-center gap-1.5 text-footnote text-[var(--apple-secondary-label)]">
            <Wallet className="size-3.5" /> 지급액 합계
          </span>
          <span className="text-title3 text-[var(--apple-label)] tabular-nums">
            {formatKRW(totals.totalAmount)}
          </span>
        </div>
      </div>

      {/* Empty state */}
      {groups.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center py-12 text-center animate-fade-up-2">
          <p className="text-sm text-[var(--apple-secondary-label)]">
            해당 기간에 프리랜서 원천징수 건이 없습니다
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 animate-fade-up-2">
          {groups.map((group, i) => {
            const isUnidentified = group.accountHolder === null;
            return (
              <details
                key={group.accountHolder ?? "__no_holder__"}
                className="glass overflow-hidden group/details"
                open={i === 0 && !isUnidentified}
              >
                <summary className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer list-none select-none hover:bg-[rgba(0,0,0,0.02)] dark:hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <svg
                      className="size-4 shrink-0 text-[var(--apple-tertiary-label)] transition-transform group-open/details:rotate-90"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden
                    >
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {isUnidentified ? (
                      <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[var(--apple-orange,#FF9500)] truncate">
                        <AlertTriangle className="size-4 shrink-0" />
                        예금주 미입력
                      </span>
                    ) : (
                      <span className="text-[15px] font-semibold text-[var(--apple-label)] truncate">
                        {group.accountHolder}
                      </span>
                    )}
                    <span className="shrink-0 text-footnote text-[var(--apple-secondary-label)] tabular-nums">
                      {group.expenseCount}건
                    </span>
                  </div>
                  <span className="shrink-0 text-[15px] font-semibold text-[var(--apple-label)] tabular-nums">
                    {formatKRW(group.totalAmount)}
                  </span>
                </summary>

                <div className="border-t border-[var(--apple-separator)]">
                  {isUnidentified && (
                    <p className="px-4 pt-3 text-xs text-[var(--apple-secondary-label)]">
                      예금주가 입력되지 않아 인원 집계에서 제외됩니다. 각 비용을 수정해 예금주를 채워주세요.
                    </p>
                  )}
                  <ul className="divide-y divide-[var(--apple-separator)]">
                    {group.expenses.map((e) => {
                      const statusInfo = STATUS_LABELS[e.status];
                      return (
                        <li key={e.id} className="px-4 py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex flex-col gap-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] text-[var(--apple-secondary-label)] tabular-nums shrink-0">
                                {formatDate(e.transactionDate)}
                              </span>
                              <a
                                href={`/expenses/${e.id}`}
                                className="text-sm text-[var(--apple-label)] hover:text-[var(--apple-blue)] transition-colors truncate"
                              >
                                {e.title}
                              </a>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap text-[12px] text-[var(--apple-tertiary-label)]">
                              <span className="rounded-md bg-[rgba(0,0,0,0.04)] dark:bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5">
                                {TYPE_LABELS[e.type] ?? e.type}
                              </span>
                              {statusInfo && <span className={statusInfo.className}>{statusInfo.label}</span>}
                              {e.companyName && <span>· {e.companyName}</span>}
                              {e.submitterName && <span>· 제출 {e.submitterName}</span>}
                              {e.bankName && (
                                <span>· {e.bankName}{e.accountNumber ? ` ${e.accountNumber}` : ""}</span>
                              )}
                            </div>
                          </div>
                          <span className="shrink-0 text-sm font-medium text-[var(--apple-label)] tabular-nums">
                            {formatExpenseAmount(e.amount, e.currency, e.amountOriginal)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </details>
            );
          })}
        </div>
      )}

      <p className="text-xs text-[var(--apple-tertiary-label)] animate-fade-up-2">
        승인·제출 대기 건 기준입니다 (반려·취소 제외). 금액은 저장된 지급액이며, 원천징수세액 계산은
        포함되어 있지 않습니다.
      </p>
    </div>
  );
}
