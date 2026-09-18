import { CalendarRange } from "lucide-react";
import { formatKRW } from "@/lib/utils/expense-utils";
import type { BoardResult } from "@/services/plan.service";
import { PlanCardItem } from "./plan-card";
import { PlanCreateButton } from "./plan-dialog";
import { ProjectOpenButton } from "./project-dialog";
import { monthLabel } from "./plan-client";

// ---------------------------------------------------------------------------
// 월별 보드 본문. **서버 컴포넌트**다 — 카드 수십 장을 클라이언트 묶음에 실을 이유가 없다.
// 상호작용(달 이동·필터·다이얼로그)은 필요한 자리에만 클라이언트 조각으로 박아 둔다.
//
// 데스크톱은 달을 나란히(최대 4열), 모바일은 위에서 아래로 쌓는다.
// ---------------------------------------------------------------------------

interface MonthBoardProps {
  board: BoardResult;
  /** 법인 필터가 걸려 있지 않으면 카드마다 법인을 적는다. */
  showCompany: boolean;
  /** 보드에 걸린 법인. 빈 상태에서 계획을 추가할 때 그대로 이어받는다. */
  companyId?: string;
}

export function MonthBoard({ board, showCompany, companyId }: MonthBoardProps) {
  const total = board.months.reduce((sum, m) => sum + m.count, 0);

  if (total === 0) {
    return <BoardEmptyState hasProject={board.projects.length > 0} companyId={companyId} />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {board.months.map((month, index) => (
        <section
          key={month.month}
          aria-label={monthLabel(month.month)}
          className="flex flex-col gap-2.5 animate-fade-up"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          {/* 달 머리 — 합계는 예정 건만 센다(취소·마감 제외) */}
          <header className="glass-subtle flex items-baseline justify-between gap-2 rounded-2xl px-4 py-3">
            <h2 className="text-headline text-[var(--apple-label)]">{monthLabel(month.month)}</h2>
            <div className="text-right">
              <p className="text-[15px] font-semibold tabular-nums text-[var(--apple-label)]">
                {formatKRW(month.total)}
              </p>
              <p className="text-caption2 text-[var(--apple-secondary-label)] tabular-nums">
                {month.count}건
              </p>
            </div>
          </header>

          {month.items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-[var(--apple-separator)] px-4 py-6 text-center text-footnote text-[var(--apple-secondary-label)]">
              계획이 없습니다
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {month.items.map((card) => (
                <PlanCardItem key={card.id} card={card} showCompany={showCompany} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * 아무것도 없을 때. 프로젝트가 하나도 없으면 계획부터 권해 봐야 막힌다 —
 * 계획은 반드시 프로젝트에 달리므로 **프로젝트 만들기를 앞세운다**.
 */
function BoardEmptyState({ hasProject, companyId }: { hasProject: boolean; companyId?: string }) {
  return (
    <div className="glass flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center animate-fade-up">
      <span className="flex size-12 items-center justify-center rounded-full bg-[var(--apple-tertiary-system-fill)]">
        <CalendarRange className="size-6 text-[var(--apple-secondary-label)]" aria-hidden="true" />
      </span>
      <div>
        <p className="text-headline text-[var(--apple-label)]">
          {hasProject ? "이 기간에 등록된 계획이 없습니다" : "아직 참여 중인 프로젝트가 없습니다"}
        </p>
        <p className="mt-1 text-footnote text-[var(--apple-secondary-label)]">
          {hasProject
            ? "달을 옮기거나 새 계획을 추가해보세요."
            : "프로젝트를 먼저 만들면 그 아래에 비용계획을 쌓을 수 있습니다."}
        </p>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {hasProject && <PlanCreateButton label="계획 추가" defaultCompanyId={companyId} />}
        <ProjectOpenButton label="프로젝트 만들기" variant={hasProject ? "outline" : "default"} />
      </div>
    </div>
  );
}
