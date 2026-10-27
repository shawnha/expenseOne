"use client";

import Link from "next/link";
import { CreditCard, Banknote, ArrowRight, Undo2, ReceiptText, CalendarPlus, Layers } from "lucide-react";
import { TiltCard } from "@/components/layout/tilt-card";
// 계획 데이터는 서버에서 읽고, 클라이언트에는 직렬화한 목록만 넘긴다.
import { SoonPlansSection } from "@/components/plans/soon-plans-section";
import type { SoonPlans } from "@/services/plan-picks.service";
import { usePendingCardSummary } from "@/hooks/use-pending-card-summary";
import { pendingCardBatchHref, pendingCardLabel } from "@/lib/card-batch/pending-summary";

const expenseTypes = [
  {
    title: "법카사용 내역",
    description: "법인카드 사용내역을 제출합니다. 자동 승인됩니다.",
    href: "/expenses/new/corporate-card",
    icon: <CreditCard className="size-6 text-[var(--apple-blue)]" />,
  },
  {
    title: "입금요청",
    description: "입금을 요청합니다. 증빙서류 첨부 필수, 관리자 승인 후 처리됩니다.",
    href: "/expenses/new/deposit-request",
    icon: <Banknote className="size-6 text-[var(--apple-green)]" />,
  },
  {
    title: "반품/환불",
    description: "반품·환불된 금액을 등록합니다. 원거래에 연결되어 합계에서 차감됩니다.",
    href: "/expenses/new/refund",
    icon: <Undo2 className="size-6 text-[var(--apple-red)]" />,
  },
  {
    title: "법카 여러 건 한 번에",
    description: "출장 등 결제가 많을 때 골라서 한 번에 올리기",
    href: "/expenses/new/card-batch",
    icon: <Layers className="size-6 text-[var(--apple-orange)]" />,
  },
] as const;

const salesTypes = [
  {
    // 비용이 아니라 매출 쪽이지만, 직원이 "뭔가 올릴 때" 찾는 자리가 여기라 같이 둔다.
    title: "세금계산서 발행 요청",
    description: "약국·의원 등에 판 건의 세금계산서를 요청합니다. 관리자가 발행하면 알림이 옵니다.",
    href: "/tax-invoices/new",
    icon: <ReceiptText className="size-6 text-[var(--apple-purple)]" />,
  },
] as const;

type TypeItem = (typeof expenseTypes)[number] | (typeof salesTypes)[number];

function TypeCard({
  type,
  index,
  pendingLabel,
  pendingHref,
}: {
  type: TypeItem;
  index: number;
  pendingLabel?: string | null;
  pendingHref?: string;
}) {
  // 안내는 「한 번에 올리기」 카드에만 — 두 카드에 같은 문구가 겹치지 않게
  const showPending = type.href === "/expenses/new/card-batch" && !!pendingLabel;

  return (
    <TiltCard>
      <Link
        href={showPending && pendingHref ? pendingHref : type.href}
        className={`glass p-5 flex flex-col gap-3 transition-all duration-200 hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)] hover:shadow-lg hover:scale-[1.02] group apple-press animate-card-enter stagger-${index + 1}`}
      >
        <div className="flex items-center justify-center size-12 rounded-2xl bg-[var(--apple-secondary-system-background)]">
          {type.icon}
        </div>
        <div>
          <span className="text-subheadline font-semibold text-[var(--apple-label)] flex items-center gap-1">
            {type.title}
            <ArrowRight className="size-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 text-[var(--apple-blue)]" />
          </span>
          <p className="text-footnote text-[var(--apple-secondary-label)] leading-relaxed mt-1">
            {type.description}
          </p>
          {/* 불러온 뒤에만 나타난다 — 0건인 사람에게 빈자리를 남기지 않는다 */}
          {showPending && (
            <p className="mt-1 text-footnote font-medium tabular-nums text-[var(--apple-blue)] animate-fade-up">
              {pendingLabel}
            </p>
          )}
        </div>
      </Link>
    </TiltCard>
  );
}

export function NewExpenseChooser({ plansEnabled, soonPlans }: { plansEnabled: boolean; soonPlans: SoonPlans | null }) {
  const summary = usePendingCardSummary();
  const pendingLabel = pendingCardLabel(summary?.count);
  const pendingHref = pendingCardBatchHref(summary?.oldestDate);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="animate-fade-up">
        <h1 className="text-title3 text-[var(--apple-label)]">비용 제출</h1>
        <p className="mt-1 text-footnote text-[var(--apple-secondary-label)]">
          제출할 유형을 선택해주세요.
        </p>
      </div>

      {soonPlans && <SoonPlansSection plans={soonPlans} />}

      <section aria-labelledby="group-now" className="space-y-3">
        <h2 id="group-now" className="text-footnote font-semibold text-[var(--apple-secondary-label)]">
          지금 쓴 돈 · 보낼 돈
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {expenseTypes.map((type, index) => (
            <TypeCard key={type.href} type={type} index={index} pendingLabel={pendingLabel} pendingHref={pendingHref} />
          ))}
        </div>
      </section>

      {/* 비용계획 권한이 있는 사람에게만. 없으면 이 구역 전체가 없다. */}
      {plansEnabled && (
        <section aria-labelledby="group-future" className="space-y-3">
          <h2 id="group-future" className="text-footnote font-semibold text-[var(--apple-secondary-label)]">
            앞으로 쓸 돈
          </h2>
          <TiltCard>
          <Link
            href="/plans?new=1"
            className="group flex items-center gap-4 rounded-[16px] border border-dashed border-[var(--apple-separator)] p-5 transition-colors hover:border-[var(--apple-blue)] hover:bg-[rgba(0,122,255,0.04)] apple-press animate-card-enter stagger-5"
          >
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--apple-secondary-system-background)]">
              <CalendarPlus className="size-6 text-[var(--apple-blue)]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="flex items-center gap-1 text-subheadline font-semibold text-[var(--apple-label)]">
                비용계획 세우기
                <ArrowRight className="size-3.5 opacity-0 -translate-x-1 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 text-[var(--apple-blue)]" aria-hidden="true" />
              </span>
              <p className="mt-1 text-footnote leading-relaxed text-[var(--apple-secondary-label)]">
                예정만 적어 둡니다 · 돈은 나가지 않습니다
              </p>
            </div>
          </Link>
          </TiltCard>
        </section>
      )}

      <section aria-labelledby="group-sales" className="space-y-3">
        <h2 id="group-sales" className="text-footnote font-semibold text-[var(--apple-secondary-label)]">
          매출
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {salesTypes.map((type, index) => (
            <TypeCard key={type.href} type={type} index={index} />
          ))}
        </div>
      </section>
    </div>
  );
}
