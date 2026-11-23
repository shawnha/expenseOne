import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { z } from "zod";
import { getCurrentUser } from "@/lib/api-utils";
import { getExpenses } from "@/services/expense.service";
import { getSettlementCompanies, getSettlementReview, type SettlementRequest } from "@/services/brand-settlement.service";
import { ExpenseReviewNavigation, SettlementTab } from "@/components/expenses/settlement-review-link";
import { Pagination } from "@/components/expenses/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatExpenseAmount, formatKRW } from "@/lib/utils/expense-utils";
import { prePaidSplit } from "@/lib/utils/pre-paid";
import { DOCUMENT_TYPE_OPTIONS } from "@/lib/validations/expense-form";
import { currentSettlementMonth, settlementMonthSchema } from "@/lib/validations/brand-settlement";

const statuses = { SUBMITTED: "승인 대기", APPROVED: "승인", REJECTED: "반려", CANCELLED: "취소" } as const;
const statusStyle = {
  SUBMITTED: "glass-badge-orange",
  APPROVED: "glass-badge-green",
  REJECTED: "glass-badge-red",
  CANCELLED: "glass-badge-gray",
};
const formatDate = (value: string) => value.replace(/-/g, ".");

const labelClass = "grid min-w-0 gap-1.5 text-sm font-medium leading-5 text-[var(--apple-label)]";
const filterControl = "h-10 w-full min-w-0 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-0 text-base font-normal leading-5 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

export async function SettlementReview({ params }: {
  params: Record<string, string | string[] | undefined>;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const companies = await getSettlementCompanies(viewer.id);
  if (companies.length === 0) notFound();
  const companyId = z.uuid().safeParse(params.company).data;
  const company = companies.find((entry) => entry.id === companyId);
  if (companyId && !company) notFound();

  const isAdmin = viewer.role === "ADMIN";
  const showRequests = isAdmin && params.scope !== "registered";
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 100) : showRequests ? "정산" : "";
  const month = settlementMonthSchema.safeParse(params.month).data ?? currentSettlementMonth();
  const page = z.coerce.number().int().min(1).max(10000).safeParse(params.page).data ?? 1;
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  // The existing all-expenses service applies its own role scoping.
  const requests = showRequests
    ? await getExpenses({
        type: "DEPOSIT_REQUEST", company: company?.slug, search: search || undefined,
        startDate: `${month}-01`, endDate: `${month}-${lastDay}`, page, limit: 20,
      }, viewer.id, viewer.role, false)
    : null;
  const review = showRequests ? null : await getSettlementReview(viewer.id, { month, companyId, search, page });
  const total = requests?.meta.total ?? review?.total ?? 0;
  const totalPages = requests?.meta.totalPages ?? review?.totalPages ?? 0;

  const href = (scope: "requests" | "registered", allRequests = false) => {
    const query = new URLSearchParams({ view: "settlements", scope, month });
    if (companyId) query.set("company", companyId);
    if (allRequests) query.set("search", "");
    return `/expenses?${query}`;
  };

  return (
    <div className="flex max-w-5xl flex-col gap-4 sm:gap-5">
      <div>
        <h1 className="text-title3 text-[var(--apple-label)]">비용 목록</h1>
        <div className="mt-3"><ExpenseReviewNavigation active /></div>
      </div>
      <section aria-label="정산 확인" className="flex flex-col gap-4">
        {isAdmin && (
          <nav aria-label="정산 조회 범위" className="flex w-fit max-w-full gap-1 rounded-full bg-[var(--apple-tertiary-system-fill)] p-1">
            <SettlementTab href={href("requests")} active={showRequests}>입금요청</SettlementTab>
            <SettlementTab href={href("registered")} active={!showRequests}>등록된 정산</SettlementTab>
          </nav>
        )}
        <form action="/expenses" data-settlement-filters
          className="grid grid-cols-1 items-end gap-2.5 sm:grid-cols-[minmax(8rem,1fr)_minmax(8rem,0.8fr)_minmax(10rem,1.25fr)_auto]">
          <input type="hidden" name="view" value="settlements" />
          {isAdmin && <input type="hidden" name="scope" value={showRequests ? "requests" : "registered"} />}
          <label className={labelClass}>
            법인
            <span className="relative block min-w-0">
              <select name="company" defaultValue={companyId ?? ""} className={`${filterControl} appearance-none pr-9`}>
                <option value="">전체 조회 법인</option>
                {companies.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--apple-secondary-label)]" />
            </span>
          </label>
          <label className={labelClass}>
            {showRequests ? "요청월" : "정산월"}
            <Input type="month" name="month" defaultValue={month} required className={filterControl} />
          </label>
          <label className={labelClass}>
            검색
            <Input name="search" defaultValue={search} maxLength={100}
              placeholder={showRequests ? "제목 또는 거래처" : "브랜드명 또는 제목"} className={filterControl} />
          </label>
          <Button type="submit" variant="outline" className="h-10 justify-self-start rounded-xl px-4 font-medium">
            <Search aria-hidden="true" />조회
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--apple-secondary-label)]">
          <p>{showRequests ? "입금요청" : "정산 대상"} <span className="font-semibold tabular-nums text-[var(--apple-label)]">{total}건</span></p>
          {showRequests && search ? (
            <Link href={href("requests", true)} className="text-sm font-medium text-[var(--apple-blue)]">해당 월 입금요청 전체</Link>
          ) : (
            <p className="text-xs">실제 송금은 이체 내역에서 확인해 주세요.</p>
          )}
        </div>
        {requests ? (
          requests.data.length > 0
            ? <RequestList requests={requests.data} />
            : <p className="glass px-4 py-9 text-center text-sm text-[var(--apple-secondary-label)]">이 조건의 입금요청이 없습니다.</p>
        ) : review && review.rows.length > 0 ? (
          <div className="glass divide-y divide-[var(--apple-separator)]">
            {review.rows.map((row) => <SettlementRow key={`${row.source_type}:${row.id}`} row={row} isAdmin={isAdmin} />)}
          </div>
        ) : (
          <div className="glass space-y-1 px-4 py-9 text-center text-sm text-[var(--apple-secondary-label)]">
            <p>이 조건으로 등록된 정산 대상이 없습니다.</p>
            {isAdmin && <p>입금요청 또는 비용계획 상세에서 정산 대상으로 등록할 수 있습니다.</p>}
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} total={total} />
      </section>
    </div>
  );
}

function RequestList({ requests }: { requests: Awaited<ReturnType<typeof getExpenses>>["data"] }) {
  return (
    <ul className="glass divide-y divide-[var(--apple-separator)]">
      {requests.map((request) => (
        <li key={request.id}>
          <Link href={`/expenses/${request.id}`} prefetch={false}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-[var(--apple-tertiary-system-fill)] sm:px-5">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`glass-badge shrink-0 ${statusStyle[request.status]}`}>{statuses[request.status]}</span>
              <span className="min-w-0 break-words text-sm font-semibold text-[var(--apple-label)]">{request.title}</span>
            </span>
            <span className="text-right text-sm font-semibold tabular-nums text-[var(--apple-label)]">
              {formatExpenseAmount(request.amount, request.currency, request.amountOriginal)}
            </span>
            <span className="col-span-2 text-xs text-[var(--apple-secondary-label)]">
              {[request.companyName, request.submitter?.name, formatDate(request.transactionDate)].filter(Boolean).join(" · ")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

type ReviewRow = Awaited<ReturnType<typeof getSettlementReview>>["rows"][number];

function SettlementRow({ row, isAdmin }: { row: ReviewRow; isAdmin: boolean }) {
  const active = row.requests.filter((request) => request.status === "SUBMITTED" || request.status === "APPROVED");
  const requestedAmount = active.reduce((total, request) => total + request.amount, 0);
  const requestSummary = row.requests.length === 0 ? "연결된 요청 없음" : active.length === 0 ? "반려·취소 확인" : `입금요청 ${active.length}건`;
  const amount = row.expected_amount !== null
    ? formatKRW(row.expected_amount)
    : row.requests[0] && formatExpenseAmount(row.requests[0].amount, row.requests[0].currency, row.requests[0].amountOriginal);

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3.5 sm:items-center sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--apple-secondary-label)]">
            <span>{row.company_name}</span>
            <span className={`glass-badge ${active.length > 0 ? "glass-badge-gray" : "glass-badge-orange"}`}>{requestSummary}</span>
          </div>
          <p className="mt-1 break-words text-sm font-semibold text-[var(--apple-label)]">{row.brand_name}</p>
          <p className="mt-0.5 break-words text-xs text-[var(--apple-secondary-label)]">{row.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-right">
          <div className="text-sm font-semibold tabular-nums text-[var(--apple-label)]">
            {amount}
            <span className="block text-xs font-normal text-[var(--apple-secondary-label)]">{row.source_type === "PLAN" ? "지급 예정액" : "요청액"}</span>
          </div>
          <ChevronDown aria-hidden="true" className="size-4 text-[var(--apple-secondary-label)] transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </div>
      </summary>
      <div className="space-y-3 border-t border-[var(--apple-separator)] px-4 py-4 text-sm sm:px-5">
        {row.source_type === "PLAN" && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[var(--apple-secondary-label)]">
              {row.planned_on && `지급 예정일 ${formatDate(row.planned_on)} · `}
              현재 요청 합계 <span className="font-medium text-[var(--apple-label)]">{formatKRW(requestedAmount)}</span>
              {row.expected_amount !== null && requestedAmount !== row.expected_amount && (
                <span className="inline-block"> · 예정액과 차이 {formatKRW(requestedAmount - row.expected_amount)}</span>
              )}
            </p>
            {isAdmin && <Link href={`/plans/${row.id}`} className="text-[var(--apple-blue)]">비용계획 열기</Link>}
          </div>
        )}
        {row.requests.length > 0 && (
          <ul className="divide-y divide-[var(--apple-separator)]">
            {row.requests.map((request) => <RequestSummary key={request.id} request={request} isAdmin={isAdmin} />)}
          </ul>
        )}
      </div>
    </details>
  );
}

function RequestSummary({ request, isAdmin }: { request: SettlementRequest; isAdmin: boolean }) {
  const evidence = DOCUMENT_TYPE_OPTIONS.filter((option) => request.evidence.includes(option.value));
  const split = prePaidSplit(request);
  const remaining = request.remainingPaymentApproved ? "잔금 승인"
    : request.remainingPaymentRequested ? "잔금 요청" : "잔금 요청 전";

  return (
    <li className="space-y-1.5 py-2 text-[var(--apple-secondary-label)]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`glass-badge ${statusStyle[request.status]}`}>{statuses[request.status]}</span>
          {isAdmin
            ? <Link href={`/expenses/${request.id}`} className="break-words font-medium text-[var(--apple-blue)]">{request.title}</Link>
            : <span className="break-words font-medium text-[var(--apple-label)]">{request.title}</span>}
        </div>
        <span className="font-semibold tabular-nums text-[var(--apple-label)]">{formatExpenseAmount(request.amount, request.currency, request.amountOriginal)}</span>
      </div>
      <p>{request.submitterName} · {request.dueDate ? `입금 기일 ${formatDate(request.dueDate)}` : "입금 기일 없음"}</p>
      {split && <p>선지급 {formatKRW(split.prePaidAmount)} · 잔금 {formatKRW(split.remainingAmount)} · {remaining}</p>}
      <p>{evidence.length ? `증빙 ${evidence.map((option) => option.label).join(", ")}` : "등록된 증빙 없음"}</p>
    </li>
  );
}
