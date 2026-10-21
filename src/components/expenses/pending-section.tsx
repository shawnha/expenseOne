import Link from "next/link";
import { ExpenseTable } from "@/components/expenses/expense-table";

type ExpenseTableRows = React.ComponentProps<typeof ExpenseTable>["expenses"];

interface PendingSectionProps {
  expenses: ExpenseTableRows;
  /** 처리 대기 전체 건수 — 보여 준 줄보다 많으면 「더 보기」 링크를 단다. */
  total: number;
  isAdmin?: boolean;
  currentUserId?: string;
}

/**
 * 목록 맨 위 「처리 대기」 칸 — 아직 처리 안 된 입금요청(승인 대기 + 후지급 요청)을
 * 올린 날짜와 상관없이 모아 기일이 급한 순으로 보여 준다. 올린 지 오래된 건이
 * 날짜순 목록 뒤 페이지에 묻혀 찾으러 가야 했다. 그 아래 목록은 이 건들을 뺀 나머지다.
 */
export function PendingSection({ expenses, total, isAdmin = false, currentUserId }: PendingSectionProps) {
  if (expenses.length === 0) return null;
  return (
    <section aria-labelledby="pending-section-title" className="flex flex-col gap-2 animate-fade-up-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1">
        <h2 id="pending-section-title" className="text-subheadline font-semibold text-[var(--apple-label)]">
          처리 대기 <span className="tabular-nums text-[#C93400] dark:text-[#FF9F0A]">{total}</span>건
        </h2>
        <p className="text-footnote text-[var(--apple-secondary-label)]">
          기일이 급한 순 · 기간 필터와 상관없이 모아 봐요
        </p>
      </div>
      <ExpenseTable
        expenses={expenses}
        showSubmitter={isAdmin}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        showDueDate
      />
      {total > expenses.length && isAdmin && (
        <Link
          href="/admin/pending"
          className="self-start px-1 text-footnote font-medium text-[var(--apple-blue)] hover:underline"
        >
          외 {total - expenses.length}건 더 — 승인 대기에서 보기
        </Link>
      )}
    </section>
  );
}

/** 처리 대기 칸 아래 목록 머리 — 위 칸이 있을 때만 단다. */
export function RestListHeading() {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-1 -mb-2 sm:-mb-3 lg:-mb-4 animate-fade-up-3">
      <h2 className="text-subheadline font-semibold text-[var(--apple-label)]">전체 내역</h2>
      <p className="text-footnote text-[var(--apple-secondary-label)]">처리 대기를 뺀 나머지 · 최근에 올린 순</p>
    </div>
  );
}
