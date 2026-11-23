import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { z } from "zod";
import { getCurrentUser } from "@/lib/api-utils";
import { getSettlementCompanies, getSettlementReview, type SettlementRequest } from "@/services/brand-settlement.service";
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

export default async function BrandSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const [params, companies] = await Promise.all([searchParams, getSettlementCompanies(viewer.id)]);
  if (companies.length === 0) notFound();
  const companyId = z.uuid().safeParse(params.company).data;
  if (companyId && !companies.some((company) => company.id === companyId)) notFound();

  const month = settlementMonthSchema.safeParse(params.month).data ?? currentSettlementMonth();
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 100) : undefined;
  const page = z.coerce.number().int().min(1).max(10000).safeParse(params.page).data ?? 1;
  const { rows, total, totalPages } = await getSettlementReview(viewer.id, { month, companyId, search, page });
  const isAdmin = viewer.role === "ADMIN";

  return (
    <div className="flex max-w-5xl flex-col gap-4 sm:gap-5">
      <Link href="/expenses" className="self-start text-sm text-[var(--apple-blue)]">비용 목록</Link>
      <div>
        <h1 className="text-title3 text-[var(--apple-label)]">브랜드 정산</h1>
        <p className="mt-0.5 text-footnote text-[var(--apple-secondary-label)]">
          정산월별 브랜드 지급 예정액과 입금요청을 확인하세요.
        </p>
      </div>
      <form action="/expenses/brand-settlements" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="grid min-w-0 gap-1 text-sm text-[var(--apple-label)]">
          법인
          <select name="company" defaultValue={companyId ?? ""} className="min-h-10 rounded-xl border border-[var(--apple-separator)] bg-[var(--apple-system-background)] px-3 text-sm">
            <option value="">전체 조회 법인</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm text-[var(--apple-label)]">
          정산월
          <Input type="month" name="month" defaultValue={month} required className="min-h-10" />
        </label>
        <label className="grid gap-1 text-sm text-[var(--apple-label)]">
          검색
          <Input name="search" defaultValue={search} maxLength={100} placeholder="브랜드명 또는 제목" className="min-h-10 sm:w-52" />
        </label>
        <Button type="submit" variant="outline" className="min-h-10 self-start sm:self-auto"><Search aria-hidden="true" />조회</Button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--apple-secondary-label)]">
        <p>정산 대상 <span className="font-semibold tabular-nums text-[var(--apple-label)]">{total}건</span></p>
        <p className="text-xs">실제 송금은 이체 내역에서 확인해 주세요.</p>
      </div>
      {rows.length > 0 ? (
        <div className="glass divide-y divide-[var(--apple-separator)]">
          {rows.map((row) => <SettlementRow key={`${row.source_type}:${row.id}`} row={row} isAdmin={isAdmin} />)}
        </div>
      ) : (
        <div className="glass space-y-1 px-4 py-9 text-center text-sm text-[var(--apple-secondary-label)]">
          <p>이 조건으로 등록된 정산 대상이 없습니다.</p>
          {isAdmin && <p>비용계획이나 입금요청 상세에서 브랜드와 정산월을 등록할 수 있습니다.</p>}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} total={total} />
    </div>
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
