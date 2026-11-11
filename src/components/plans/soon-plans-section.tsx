"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPickDate } from "@/lib/plans/pick-ui";
import type { SoonPlan, SoonPlans } from "@/services/plan-picks.service";

/** 행 전체 링크와 두 동작은 형제다 — 링크 안에 링크를 넣지 않는다. */
function SoonPlanRow({ plan }: { plan: SoonPlan }) {
  const amount = plan.currency === "USD"
    ? `$${plan.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : `${plan.amount.toLocaleString("ko-KR")}원`;
  return (
    <li className="relative rounded-2xl border border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)] p-3">
      <Link
        href={`/plans/${plan.id}`}
        aria-label={plan.title}
        className="absolute inset-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--apple-blue)]"
      />
      <div className="pointer-events-none flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[14px] font-semibold text-[var(--apple-label)]">{plan.title}</span>
        <span className="shrink-0 text-[12px] font-medium tabular-nums text-[var(--apple-secondary-label)]">계획 {amount}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="pointer-events-none flex items-center gap-1.5 text-[11px] tabular-nums text-[var(--apple-secondary-label)]">
          <span>{formatPickDate(plan.plannedDate, plan.datePrecision)}</span>
          {!plan.ownedByMe && plan.ownerName && <span>· 담당 {plan.ownerName}</span>}
          <span className={cn(plan.daysUntil < 0 && "text-[var(--apple-orange)]")}>
            {plan.daysUntil < 0 ? `${-plan.daysUntil}일 지남` : plan.daysUntil === 0 ? "D-day" : `D-${plan.daysUntil}`}
          </span>
        </div>
        <div className="relative z-10 flex gap-1">
          <Link
            href={`/expenses/new/deposit-request?plan=${plan.id}`}
            aria-label={`${plan.title} 입금요청으로 만들기`}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--apple-blue)] px-3 text-[12px] font-medium text-white apple-press"
          >
            입금요청
          </Link>
          {plan.daysUntil <= 0 && (
            <Link
              href={`/plans/${plan.id}?link=card`}
              aria-label={`${plan.title} 법카 결제 연결`}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--apple-tertiary-system-fill)] px-3 text-[12px] font-medium text-[var(--apple-blue)] apple-press"
            >
              법카 연결
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

/** 서버가 정한 건수 그대로 펼친다. 클라이언트 날짜와 잘라내기를 섞지 않는다. */
export function SoonPlansSection({ plans }: { plans: SoonPlans }) {
  const [expanded, setExpanded] = useState(false);
  if (plans.initial.length === 0) return null;
  return (
    <section aria-labelledby="soon-plans-heading" className="glass space-y-3 p-4">
      <div>
        <h2 id="soon-plans-heading" className="flex items-center gap-2 text-subheadline font-semibold text-[var(--apple-label)]">
          <CalendarClock className="size-4 text-[var(--apple-blue)]" aria-hidden="true" />
          곧 나갈 내 계획
        </h2>
        <p className="mt-1 text-footnote text-[var(--apple-secondary-label)]">내가 참여한 프로젝트 계획에서 바로 올려요. 담당자가 아니어도 돼요.</p>
      </div>
      <ul id="soon-plans-list" className="space-y-2">
        {plans.initial.map((plan) => <SoonPlanRow key={plan.id} plan={plan} />)}
        {expanded && plans.additional.map((plan) => <SoonPlanRow key={plan.id} plan={plan} />)}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {plans.moreCount > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="soon-plans-list"
            onClick={() => setExpanded((value) => !value)}
            className="min-h-11 rounded-full px-3 text-[13px] font-medium text-[var(--apple-blue)]"
          >
            {expanded ? "접기" : `더 보기 (${plans.moreCount})`}
          </button>
        )}
        <Link href="/plans" className="ml-auto inline-flex min-h-11 items-center rounded-full px-3 text-[13px] text-[var(--apple-secondary-label)]">
          계획 전체 보기
        </Link>
      </div>
    </section>
  );
}
