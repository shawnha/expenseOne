import Link from "next/link";
import { MessageCircle, Link2, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatKRW } from "@/lib/utils/expense-utils";
import type { PlanCard as PlanCardData } from "@/services/plan.service";
import { diffBadge, PLAN_STATUS_LABEL } from "./plan-client";

// ---------------------------------------------------------------------------
// 월별 보드의 계획 카드 한 장. 서버 컴포넌트라 클라이언트 묶음에 들어가지 않는다.
// ---------------------------------------------------------------------------

const DIFF_TONE = {
  green: "glass-badge glass-badge-green",
  orange: "glass-badge glass-badge-orange",
  red: "glass-badge glass-badge-red",
} as const;

interface PlanCardProps {
  card: PlanCardData;
  /** 법인이 섞여 보일 때만 법인 이름을 단다. 한 법인만 볼 때는 줄마다 같은 말이 반복될 뿐이다. */
  showCompany?: boolean;
}

export function PlanCardItem({ card, showCompany = false }: PlanCardProps) {
  const diff = diffBadge(card.diff, card.linkCount);
  const cancelled = card.status === "CANCELLED";

  return (
    <Link
      href={`/plans/${card.id}`}
      prefetch={false}
      className={cn(
        "glass-card block p-4 rounded-2xl apple-press",
        "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        cancelled && "opacity-60",
      )}
    >
      {/* 제목 + 금액 */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight text-[var(--apple-label)] truncate">
            {card.title}
          </p>
          <p className="mt-1 text-[13px] text-[var(--apple-secondary-label)] truncate">
            {showCompany && <span>{card.companyName} · </span>}
            {card.projectName}
            {card.brandName && <span> · {card.brandName}</span>}
          </p>
        </div>
        <p className="shrink-0 text-[15px] font-semibold tabular-nums text-[var(--apple-label)]">
          {formatKRW(card.amount)}
        </p>
      </div>

      {/* 날짜 · 담당자 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--apple-secondary-label)]">
        <span className="tabular-nums">{card.plannedDateLabel}</span>
        {card.ownerName && (
          <span className="inline-flex items-center gap-1">
            <UserIcon className="size-3" aria-hidden="true" />
            {card.ownerName}
          </span>
        )}
        {card.vendorName && <span className="truncate">{card.vendorName}</span>}
      </div>

      {/* 배지 줄 */}
      {(cancelled || card.linkCount > 0 || diff || card.unreadComments > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {cancelled && (
            <span className="glass-badge glass-badge-gray">{PLAN_STATUS_LABEL.CANCELLED}</span>
          )}
          {card.linkCount > 0 && (
            <span className="glass-badge glass-badge-blue inline-flex items-center gap-1">
              <Link2 className="size-3" aria-hidden="true" />
              연결 {card.linkCount}건
            </span>
          )}
          {diff && <span className={DIFF_TONE[diff.tone]}>{diff.label}</span>}
          {card.unreadComments > 0 && (
            <span className="glass-badge glass-badge-purple inline-flex items-center gap-1">
              <MessageCircle className="size-3" aria-hidden="true" />
              새 메모 {card.unreadComments}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
