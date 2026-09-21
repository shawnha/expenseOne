"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronDown, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CompanyBadge } from "@/components/companies/company-badge";
import { formatKRW } from "@/lib/utils/expense-utils";
import { groupByProject, shouldGroupByProject, type ProjectGroup } from "@/lib/plans/board";
import { groupByMonth, monthRange, parseMonth, plannedDateLabel } from "@/lib/plans/diff";
import { moveDateToMonth, shiftDateByMonths } from "@/lib/plans/move";
import type { BoardMonth, BoardResult, PlanCard } from "@/services/plan.service";
import { PlanBoardContext, usePlanBoard, type DragState, type PlanBoardActions } from "./board-context";
import { PlanCardItem } from "./plan-card";
import { PlanCreateButton, PlanDialog, type PlanEditTarget } from "./plan-dialog";
import { ProjectOpenButton } from "./project-dialog";
import { monthLabel, planFetch } from "./plan-client";
import { DESKTOP_POINTER_QUERY, useMediaQuery } from "./use-media-query";

// ---------------------------------------------------------------------------
// 월별 보드 본문 (v1.1: 클라이언트 컴포넌트).
//
// 첫 버전은 서버 컴포넌트였다. 이제 카드를 다른 달로 끌어다 놓고(낙관적 갱신 + 되돌리기),
// 프로젝트 서랍을 접었다 펴고, 카드 메뉴에서 바로 수정·삭제를 열어야 하므로 보드 전체가
// 클라이언트로 내려왔다. 데이터는 여전히 서버가 한 번에 준다(BoardResult) — 여기서는 그 위에
// "아직 서버가 모르는 이동" 만 겹쳐 그린다. 서버가 새로 그려 주면(router.refresh) 겹친 것은 버린다.
//
// 프로젝트가 최상위다: 필터가 '전체'이고 범위 안 프로젝트가 둘 이상이면 프로젝트마다 서랍 하나.
// 데스크톱은 달을 나란히(최대 4열), 모바일은 위에서 아래로 쌓는다.
// ---------------------------------------------------------------------------

interface MonthBoardProps {
  board: BoardResult;
  /** 법인 필터가 걸려 있지 않으면 카드마다 법인을 적는다. */
  showCompany: boolean;
  /** 보드에 걸린 법인. 빈 상태에서 계획을 추가할 때 그대로 이어받는다. */
  companyId?: string;
  /** 보드에 걸린 프로젝트. 있으면 서랍 없이 그 프로젝트만 그린다. */
  projectId?: string;
  /** 지금 달(KST, 서버 계산). 네 달을 나란히 놓으면 어느 칸이 이번 달인지 표시가 없으면 알 수 없다. */
  currentMonth?: string;
}

/** 서버가 준 카드 위에 겹치는 값. 달 이동이 바꾸는 것은 예정일과 version 뿐이다. */
interface LocalPatch {
  plannedDate: string;
  version: number;
}

interface DialogState {
  card: PlanCard;
  mode: "edit" | "cancel";
}

const MAX_TOAST_TITLE = 24;
function clipTitle(title: string): string {
  const t = title.trim();
  return t.length > MAX_TOAST_TITLE ? `${t.slice(0, MAX_TOAST_TITLE - 1)}…` : t;
}

export function MonthBoard({ board, showCompany, companyId, projectId, currentMonth }: MonthBoardProps) {
  const router = useRouter();
  const canDrag = useMediaQuery(DESKTOP_POINTER_QUERY);

  const keys = useMemo(() => monthRange(board.from, board.monthCount).keys, [board.from, board.monthCount]);
  const baseItems = useMemo(() => board.months.flatMap((m) => m.items), [board.months]);

  // 겹친 이동은 **그 보드에 대해서만** 유효하다. 서버가 새 board 를 주면 자연히 빈 것으로 읽힌다.
  const [patches, setPatches] = useState<{ board: BoardResult; map: Record<string, LocalPatch> }>({
    board,
    map: {},
  });
  const patchMap = patches.board === board ? patches.map : undefined;

  const items = useMemo(
    () =>
      baseItems.map((card) => {
        const p = patchMap?.[card.id];
        if (!p) return card;
        return {
          ...card,
          plannedDate: p.plannedDate,
          plannedDateLabel: plannedDateLabel(p.plannedDate, card.datePrecision),
          version: p.version,
        };
      }),
    [baseItems, patchMap],
  );

  // 비동기 흐름(PATCH 응답·토스트의 되돌리기)이 **그때의** 최신 카드·보드를 읽을 수 있게.
  // 되돌리기는 몇 초 뒤에 눌리는데 그 사이 서버가 보드를 새로 줬을 수 있다.
  const itemsRef = useRef(items);
  const boardRef = useRef(board);
  useEffect(() => {
    itemsRef.current = items;
    boardRef.current = board;
  }, [items, board]);

  const applyPatch = useCallback((cardId: string, patch: Partial<LocalPatch>) => {
    setPatches((prev) => {
      const latest = boardRef.current;
      const map = prev.board === latest ? prev.map : {};
      const current = itemsRef.current.find((c) => c.id === cardId);
      if (!current) return prev;
      const merged: LocalPatch = {
        plannedDate: patch.plannedDate ?? map[cardId]?.plannedDate ?? current.plannedDate,
        version: patch.version ?? map[cardId]?.version ?? current.version,
      };
      return { board: latest, map: { ...map, [cardId]: merged } };
    });
  }, []);

  const [dragging, setDragging] = useState<DragState | null>(null);
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  /** PATCH 가 나가 있는 카드. 같은 카드를 연달아 옮기면 두 번째는 옛 version 으로 나가 409 가 된다(QA D-04). */
  const inflight = useRef(new Set<string>());

  // --- 달 옮기기: 낙관적 갱신 → PATCH → 실패면 원위치, 성공이면 '되돌리기' 토스트 ---------------

  const patchDate = useCallback(
    (cardId: string, version: number, plannedDate: string) =>
      planFetch<{ id: string; version: number }>(`/api/plans/items/${cardId}`, {
        method: "PATCH",
        body: JSON.stringify({ version, plannedDate }),
      }),
    [],
  );

  /**
   * 한 번의 이동: 낙관적으로 먼저 옮기고 PATCH, 실패면 원위치. 성공하면 이동 전 날짜를 돌려준다.
   * 토스트는 부르는 쪽이 띄운다(처음 이동과 되돌리기가 다른 말을 한다).
   */
  const performMove = useCallback(
    async (cardId: string, nextDate: string): Promise<{ title: string; prevDate: string } | null> => {
      const card = itemsRef.current.find((c) => c.id === cardId);
      if (!card || card.status !== "PLANNED") return null;
      if (inflight.current.has(cardId)) return null;
      const prevDate = card.plannedDate;
      if (nextDate === prevDate) return null;

      inflight.current.add(cardId);
      applyPatch(cardId, { plannedDate: nextDate });
      try {
        const res = await patchDate(cardId, card.version, nextDate);
        if (!res.ok) {
          applyPatch(cardId, { plannedDate: prevDate });
          toast.error(res.message);
          // 낙관적 잠금에 걸렸으면 화면의 version 이 옛것이다. 서버 것으로 다시 그린다.
          if (res.code === "CONFLICT") router.refresh();
          return null;
        }
        applyPatch(cardId, { version: res.data.version });
        return { title: card.title, prevDate };
      } finally {
        inflight.current.delete(cardId);
      }
    },
    [applyPatch, patchDate, router],
  );

  const moveTo = useCallback(
    async (cardId: string, nextDate: string) => {
      const moved = await performMove(cardId, nextDate);
      if (!moved) return;
      const targetMonth = nextDate.slice(0, 7);
      const outside = !keys.includes(targetMonth);
      toast.success(`'${clipTitle(moved.title)}' → ${monthLabel(targetMonth)}${outside ? " (지금 범위 밖)" : ""}`, {
        duration: 6000,
        action: {
          label: "되돌리기",
          onClick: () => {
            void performMove(cardId, moved.prevDate).then((undone) => {
              if (undone) toast.success(`'${clipTitle(undone.title)}' 계획을 되돌렸습니다.`);
            });
          },
        },
      });
    },
    [performMove, keys],
  );

  const moveToMonth = useCallback(
    (cardId: string, targetMonth: string) => {
      const card = itemsRef.current.find((c) => c.id === cardId);
      if (!card || !parseMonth(targetMonth)) return;
      const next = moveDateToMonth(card.plannedDate, card.datePrecision, targetMonth);
      if (next) void moveTo(cardId, next);
    },
    [moveTo],
  );

  const shiftMonth = useCallback(
    (cardId: string, delta: 1 | -1) => {
      const card = itemsRef.current.find((c) => c.id === cardId);
      if (!card) return;
      const next = shiftDateByMonths(card.plannedDate, card.datePrecision, delta);
      if (next) void moveTo(cardId, next);
    },
    [moveTo],
  );

  const actions = useMemo<PlanBoardActions>(
    () => ({
      canDrag,
      dragging,
      setDragging,
      moveToMonth,
      shiftMonth,
      openEdit: (card) => setDialog({ card, mode: "edit" }),
      openDelete: (card) => setDialog({ card, mode: "cancel" }),
      swipeOpenId,
      setSwipeOpenId,
    }),
    [canDrag, dragging, moveToMonth, shiftMonth, swipeOpenId],
  );

  // --- 묶기 ---------------------------------------------------------------------------

  const grouped = shouldGroupByProject(projectId, board.projects.length);
  const months = useMemo(() => groupByMonth(items, keys), [items, keys]);
  const groups = useMemo(
    () => (grouped ? groupByProject(items, board.projects, keys) : []),
    [grouped, items, board.projects, keys],
  );

  const editTarget: PlanEditTarget | null = dialog
    ? {
        id: dialog.card.id,
        version: dialog.card.version,
        companyId: dialog.card.companyId,
        companyName: dialog.card.companyName,
        projectId: dialog.card.projectId,
        brandId: dialog.card.brandId,
        brandName: dialog.card.brandName,
        title: dialog.card.title,
        amount: dialog.card.amount,
        plannedDate: dialog.card.plannedDate,
        datePrecision: dialog.card.datePrecision,
        vendorName: dialog.card.vendorName,
        description: dialog.card.description,
        status: dialog.card.status,
      }
    : null;

  if (items.length === 0) {
    return <BoardEmptyState hasProject={board.projects.length > 0} companyId={companyId} />;
  }

  return (
    <PlanBoardContext.Provider value={actions}>
      {grouped ? (
        <div className="flex flex-col gap-4">
          <SummaryStrip months={months} currentMonth={currentMonth} />
          {groups.map((group, index) => (
            <ProjectDrawer key={group.project.id} group={group} index={index} currentMonth={currentMonth} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {months.map((month, index) => (
            <MonthColumn
              key={month.month}
              month={month}
              index={index}
              currentMonth={currentMonth}
              showCompany={showCompany}
              showProject
            />
          ))}
        </div>
      )}

      {canDrag && (
        <p className="text-caption2 text-[var(--apple-tertiary-label)]">
          카드를 다른 달 칸으로 끌어다 놓으면 예정일이 그 달로 옮겨집니다. 오른쪽 클릭이나 … 버튼으로도 옮길 수 있습니다.
        </p>
      )}

      {dialog && editTarget && (
        <PlanDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          plan={editTarget}
          initialMode={dialog.mode}
        />
      )}
    </PlanBoardContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// 달 칸 하나 = 드롭 대상(머리 + 몸통 전체).
// ---------------------------------------------------------------------------

function MonthColumn({
  month,
  index,
  currentMonth,
  showCompany,
  showProject,
  dropProjectId,
}: {
  month: BoardMonth;
  index: number;
  currentMonth?: string;
  showCompany: boolean;
  showProject: boolean;
  /** 서랍 안에서는 같은 프로젝트의 카드만 받는다. 없으면(서랍 밖) 아무 카드나. */
  dropProjectId?: string;
}) {
  const board = usePlanBoardStrict();
  const dragging = board.dragging;
  const accepts =
    dragging !== null &&
    dragging.month !== month.month &&
    (dropProjectId === undefined || dragging.projectId === dropProjectId);

  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const lastDrag = useRef<DragState | null>(null);

  const onDragEnter = useCallback(
    (e: DragEvent<HTMLElement>) => {
      if (!accepts || !dragging) return;
      e.preventDefault();
      // dragenter/leave 는 자식 요소를 지날 때마다 쌍으로 온다. 깊이를 세되, 새 드래그(새 객체)면 0 부터 —
      // 취소된 드래그는 leave 를 남기지 않을 수 있어서 id 가 같아도 다시 센다.
      if (lastDrag.current !== dragging) {
        lastDrag.current = dragging;
        depth.current = 0;
      }
      depth.current += 1;
      setOver(true);
    },
    [accepts, dragging],
  );

  const onDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      if (!accepts) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    [accepts],
  );

  const onDragLeave = useCallback(() => {
    if (!accepts) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  }, [accepts]);

  const onDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      if (!accepts || !dragging) return;
      board.moveToMonth(dragging.id, month.month);
      board.setDragging(null);
    },
    [accepts, dragging, board, month.month],
  );

  const highlight = accepts && over;

  return (
    <section
      aria-label={monthLabel(month.month)}
      className={cn(
        "flex flex-col gap-2.5 rounded-[22px] transition-[box-shadow,background-color] duration-150 animate-fade-up",
        accepts && "ring-2 ring-[var(--apple-blue)]/25",
        highlight && "bg-[var(--apple-blue)]/8 ring-[var(--apple-blue)]",
      )}
      style={{ animationDelay: `${index * 50}ms` }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* 달 머리 — 합계는 예정 건만 센다(취소·마감 제외) */}
      <header className="glass-subtle flex items-baseline justify-between gap-2 px-4 py-3">
        <div className="flex items-baseline gap-1.5">
          <h2 className="text-headline text-[var(--apple-label)]">{monthLabel(month.month)}</h2>
          {month.month === currentMonth && <span className="glass-badge glass-badge-blue">이번 달</span>}
        </div>
        <div className="text-right">
          <p className="text-[15px] font-semibold tabular-nums text-[var(--apple-label)]">
            {formatKRW(month.total)}
          </p>
          <p className="text-caption2 text-[var(--apple-secondary-label)] tabular-nums">{month.count}건</p>
        </div>
      </header>

      {month.items.length === 0 ? (
        <p
          className={cn(
            "rounded-2xl border border-dashed border-[var(--apple-separator)] px-4 py-6 text-center text-footnote text-[var(--apple-secondary-label)]",
            highlight && "border-[var(--apple-blue)] text-[var(--apple-blue)]",
          )}
        >
          {accepts ? "여기에 놓으면 이 달로 옮깁니다" : "계획이 없습니다"}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {month.items.map((card) => (
            <PlanCardItem key={card.id} card={card} showCompany={showCompany} showProject={showProject} />
          ))}
          {accepts && (
            <p
              className={cn(
                "rounded-2xl border border-dashed border-[var(--apple-separator)] px-4 py-3 text-center text-caption1 text-[var(--apple-secondary-label)]",
                highlight && "border-[var(--apple-blue)] text-[var(--apple-blue)]",
              )}
              aria-hidden="true"
            >
              여기에 놓으면 이 달로 옮깁니다
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** 카드와 같은 훅을 쓰되, 달 칸은 보드 밖에 놓일 일이 없으므로 null 을 허용하지 않는다. */
function usePlanBoardStrict(): PlanBoardActions {
  const board = usePlanBoard();
  if (!board) throw new Error("MonthColumn 은 MonthBoard 안에서만 쓴다");
  return board;
}

// ---------------------------------------------------------------------------
// 프로젝트 서랍. 접힘은 localStorage 에 프로젝트 id 로 기억한다(기기·브라우저마다 따로).
// ---------------------------------------------------------------------------

const DRAWER_KEY_PREFIX = "expenseone.plans.drawer.";

function readCollapsed(projectId: string): boolean {
  try {
    return window.localStorage.getItem(DRAWER_KEY_PREFIX + projectId) === "collapsed";
  } catch {
    return false;
  }
}

function writeCollapsed(projectId: string, collapsed: boolean): void {
  try {
    if (collapsed) window.localStorage.setItem(DRAWER_KEY_PREFIX + projectId, "collapsed");
    else window.localStorage.removeItem(DRAWER_KEY_PREFIX + projectId);
  } catch {
    // 사파리 개인 정보 보호 모드 등 — 기억하지 못할 뿐, 접고 펴는 것은 된다.
  }
}

function ProjectDrawer({
  group,
  index,
  currentMonth,
}: {
  group: ProjectGroup<PlanCard>;
  index: number;
  currentMonth?: string;
}) {
  const { project } = group;
  const [collapsed, setCollapsed] = useState(false);
  const bodyId = `plan-drawer-${project.id}`;

  // 저장된 접힘은 마운트 뒤에 읽는다 — 렌더 중에 읽으면 서버 HTML 과 어긋난다(하이드레이션 오류).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 는 클라이언트에서만 읽을 수 있다
    setCollapsed(readCollapsed(project.id));
  }, [project.id]);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      writeCollapsed(project.id, !prev);
      return !prev;
    });
  }, [project.id]);

  return (
    <section
      aria-labelledby={`${bodyId}-title`}
      // 글래스 위에 글래스를 겹치지 않는다(DESIGN.md) — 서랍은 테두리만 두고 안의 달 머리·카드가 글래스다.
      className="rounded-[22px] border border-[var(--apple-separator)] p-2 sm:p-3 animate-fade-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        className="flex min-h-11 w-full items-center gap-2 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-[var(--apple-tertiary-system-fill)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--apple-blue)]"
      >
        <ChevronDown
          className={cn(
            "size-5 shrink-0 text-[var(--apple-secondary-label)] transition-transform duration-200",
            collapsed && "-rotate-90",
          )}
          aria-hidden="true"
        />
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span id={`${bodyId}-title`} className="inline-block max-w-full truncate align-bottom text-headline text-[var(--apple-label)]">
            {project.name}
          </span>
          <CompanyBadge name={project.companyName} slug={project.companySlug} />
          <span className="inline-flex items-center gap-1 text-caption1 text-[var(--apple-secondary-label)]">
            <Users className="size-3.5" aria-hidden="true" />
            참여자 {project.memberCount}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[15px] font-semibold tabular-nums text-[var(--apple-label)]">
            {formatKRW(group.total)}
          </span>
          <span className="block text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
            {group.count}건
          </span>
        </span>
      </button>

      <div id={bodyId} hidden={collapsed} className="mt-2">
        {group.count === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-[var(--apple-separator)] px-4 py-3">
            <p className="text-footnote text-[var(--apple-secondary-label)]">이 기간에 계획이 없습니다.</p>
            <PlanCreateButton
              label="계획 추가"
              variant="outline"
              size="sm"
              defaultCompanyId={project.companyId}
              defaultProjectId={project.id}
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {group.months.map((month, i) => (
              <MonthColumn
                key={month.month}
                month={month}
                index={i}
                currentMonth={currentMonth}
                // 서랍 머리가 법인·프로젝트를 이미 말한다 — 카드마다 되풀이하지 않는다.
                showCompany={false}
                showProject={false}
                dropProjectId={project.id}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 서랍 모드의 전체 요약 — 필터 전체에 대한 달별 합계. 서랍 머리는 프로젝트 소계뿐이라 이게 없으면
// "이번 달에 다 합쳐서 얼마" 를 볼 자리가 없다.
// ---------------------------------------------------------------------------

function SummaryStrip({ months, currentMonth }: { months: BoardMonth[]; currentMonth?: string }) {
  return (
    <div className="glass-subtle grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-4" aria-label="달별 합계">
      {months.map((m) => (
        <div key={m.month} className="min-w-0">
          <p className="flex items-center gap-1.5 text-caption1 text-[var(--apple-secondary-label)]">
            <span className="truncate">{monthLabel(m.month)}</span>
            {m.month === currentMonth && <span className="glass-badge glass-badge-blue">이번 달</span>}
          </p>
          <p className="text-[15px] font-semibold tabular-nums text-[var(--apple-label)]">{formatKRW(m.total)}</p>
          <p className="text-caption2 tabular-nums text-[var(--apple-secondary-label)]">{m.count}건</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * 아무것도 없을 때. 프로젝트가 하나도 없으면 계획부터 권해 봐야 막힌다 —
 * 계획은 반드시 프로젝트에 달리므로 **프로젝트 만들기를 앞세운다**.
 */
function BoardEmptyState({ hasProject, companyId }: { hasProject: boolean; companyId?: string }) {
  return (
    <div className="glass flex flex-col items-center gap-3 px-6 py-14 text-center animate-fade-up">
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
