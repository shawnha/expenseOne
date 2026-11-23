import { redirect } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { z } from "zod";
import { getCurrentUser } from "@/lib/api-utils";
import { getExpenseTeams, getTeamExpenseList } from "@/services/team-expense.service";
import { ExpenseScopeNav } from "@/components/expenses/expense-scope-nav";
import { Pagination } from "@/components/expenses/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatExpenseAmount, getCategoryLabel } from "@/lib/utils/expense-utils";
import { prePaidSplit } from "@/lib/utils/pre-paid";
import { DOCUMENT_TYPE_OPTIONS } from "@/lib/validations/expense-form";

const types = { DEPOSIT_REQUEST: "입금요청", CORPORATE_CARD: "법카사용", REFUND: "반품" } as const;
const statuses = { SUBMITTED: "승인 대기", APPROVED: "승인", REJECTED: "반려", CANCELLED: "취소" } as const;
const statusStyle = {
  SUBMITTED: "glass-badge-orange",
  APPROVED: "glass-badge-green",
  REJECTED: "glass-badge-red",
  CANCELLED: "glass-badge-gray",
};

const selectClass = "min-h-10 min-w-0 rounded-lg border border-[var(--apple-separator)] bg-[var(--apple-system-background)] px-2.5 text-sm text-[var(--apple-label)]";
const formatDate = (value: string) => value.replace(/-/g, ".");

export default async function TeamExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  const [params, teams] = await Promise.all([searchParams, getExpenseTeams(viewer.id)]);
  const teamId = z.uuid().safeParse(params.team).data;
  const type = z.enum(typesKeys).safeParse(params.type).data;
  const status = z.enum(statusKeys).safeParse(params.status).data;
  const search = typeof params.search === "string" ? params.search.trim().slice(0, 100) : undefined;
  const page = z.coerce.number().int().min(1).max(10000).safeParse(params.page).data ?? 1;
  const result = teams.length > 0
    ? await getTeamExpenseList(viewer.id, { teamId, type, status, search, page })
    : null;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div>
        <h1 className="text-title3 text-[var(--apple-label)]">팀 비용</h1>
        <p className="mt-0.5 text-footnote text-[var(--apple-secondary-label)]">
          같은 팀의 입금요청, 법카 정산과 증빙 등록 상태를 확인하세요.
        </p>
      </div>
      <ExpenseScopeNav current="team" />
      {result ? (
        <>
          <form action="/expenses/team" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Input name="search" defaultValue={search} maxLength={100} placeholder="제목·제출자·거래처 검색" aria-label="팀 비용 검색" className="min-h-10 sm:w-60" />
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="조회 팀" name="team" defaultValue={teamId ?? ""} className={selectClass}>
                <option value="">전체 소속 팀</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.companyName} · {team.name}</option>)}
              </select>
              <select aria-label="비용 유형" name="type" defaultValue={type ?? ""} className={selectClass}>
                <option value="">전체 유형</option>
                {typesKeys.map((key) => <option key={key} value={key}>{types[key]}</option>)}
              </select>
              <select aria-label="처리 상태" name="status" defaultValue={status ?? ""} className={selectClass}>
                <option value="">전체 상태</option>
                {statusKeys.map((key) => <option key={key} value={key}>{statuses[key]}</option>)}
              </select>
              <Button type="submit" variant="outline" className="min-h-10"><Search aria-hidden="true" />조회</Button>
            </div>
          </form>
          {result.rows.length > 0 ? (
            <div className="glass divide-y divide-[var(--apple-separator)]">
              {result.rows.map((expense) => <TeamExpenseRow key={expense.id} expense={expense} />)}
            </div>
          ) : (
            <p className="glass px-4 py-10 text-center text-sm text-[var(--apple-secondary-label)]">조회 조건에 맞는 팀 비용이 없습니다.</p>
          )}
          <Pagination page={page} totalPages={result.totalPages} total={result.total} />
        </>
      ) : (
        <p className="glass px-4 py-10 text-center text-sm text-[var(--apple-secondary-label)]">
          조회할 수 있는 팀이 없습니다. 관리자에게 비용 조회 팀 지정을 요청해 주세요.
        </p>
      )}
    </div>
  );
}

const typesKeys = ["DEPOSIT_REQUEST", "CORPORATE_CARD", "REFUND"] as const;
const statusKeys = ["SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"] as const;
type TeamExpense = Awaited<ReturnType<typeof getTeamExpenseList>>["rows"][number];

function TeamExpenseRow({ expense }: { expense: TeamExpense }) {
  const evidence = DOCUMENT_TYPE_OPTIONS.filter((option) => expense.evidence.includes(option.value));
  const split = prePaidSplit(expense);
  const evidenceLabel = evidence.length ? evidence.map((option) => option.label).join(", ") : "등록된 증빙 없음";

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3.5 sm:items-center sm:px-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--apple-secondary-label)]">
            <span>{types[expense.type]}</span>
            <span className={`glass-badge ${statusStyle[expense.status]}`}>{statuses[expense.status]}</span>
          </div>
          <p className="mt-1 break-words text-sm font-semibold text-[var(--apple-label)]">{expense.title}</p>
          <p className="mt-0.5 text-xs text-[var(--apple-secondary-label)]">
            {expense.submitterName} · {expense.companyName} · {formatDate(expense.transactionDate)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-right">
          <span className="text-sm font-semibold tabular-nums text-[var(--apple-label)]">
            {formatExpenseAmount(expense.type === "REFUND" ? -expense.amount : expense.amount, expense.currency, expense.type === "REFUND" && expense.amountOriginal != null ? -expense.amountOriginal : expense.amountOriginal)}
          </span>
          <ChevronDown aria-hidden="true" className="size-4 text-[var(--apple-secondary-label)] transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </div>
      </summary>
      <dl className="grid gap-x-6 gap-y-3 border-t border-[var(--apple-separator)] px-4 py-4 text-sm sm:grid-cols-2 sm:px-5">
        <TeamExpenseField label="카테고리" value={getCategoryLabel(expense.category)} />
        {expense.merchantName && <TeamExpenseField label="거래처" value={expense.merchantName} />}
        {expense.type === "DEPOSIT_REQUEST" && (
          <TeamExpenseField label="입금 기일" value={expense.dueDate ? formatDate(expense.dueDate) : "기일 없음"} />
        )}
        {expense.type === "DEPOSIT_REQUEST" && expense.hasFreelancerWithholding && (
          <TeamExpenseField label="요청 금액 기준" value="원천징수 차감 후" />
        )}
        {split && (
          <TeamExpenseField
            label="선지급 / 잔금"
            value={`${split.prePaidAmount.toLocaleString("ko-KR")}원 / ${split.remainingAmount.toLocaleString("ko-KR")}원 · ${expense.remainingPaymentApproved ? "잔금 승인" : expense.remainingPaymentRequested ? "잔금 요청" : "잔금 요청 전"}`}
          />
        )}
        <TeamExpenseField label="등록된 증빙" value={evidenceLabel} />
      </dl>
    </details>
  );
}

function TeamExpenseField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--apple-secondary-label)]">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-[var(--apple-label)]">{value}</dd>
    </div>
  );
}
