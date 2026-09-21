"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ContextMenu } from "@base-ui/react/context-menu";
import { ChevronLeft, ChevronRight, Ellipsis, Link2, MessageCircle, Pencil, Trash2, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CompanyBadge } from "@/components/companies/company-badge";
import { formatKRW } from "@/lib/utils/expense-utils";
import { monthKeyOf } from "@/lib/plans/diff";
import type { PlanCard as PlanCardData } from "@/services/plan.service";
import { usePlanBoard } from "./board-context";
import { diffBadge, PLAN_STATUS_LABEL } from "./plan-client";

// ---------------------------------------------------------------------------
// 월별 보드의 계획 카드 한 장 (v1.1: 클라이언트 컴포넌트).
//
// 카드 하나가 받는 입력:
//   - 누르기            → 상세로 (Link)
//   - 데스크톱 드래그    → 다른 달 칸에 떨어뜨리면 예정일이 그 달로 (HTML5 drag, 보드가 처리)
//   - 오른쪽 클릭 / 길게 누르기(500ms, 10px 안) → base-ui ContextMenu 가 그 지점에 빠른 메뉴를 연다.
//     손을 떼며 따라오는 pointerup·click 은 ContextMenu 의 유예(500ms)와 아래 guard 가 "바깥 누름" 으로
//     치지 않는다(QA D2-01). "…" 버튼(44px, 키보드)은 같은 메뉴를 버튼에 붙여 연다.
//   - 모바일 왼쪽 스와이프 → 수정·삭제 버튼이 드러난다. 세로 스크롤과 싸우지 않도록 가로 움직임이
//     확실히 클 때만 잡고(touch-action: pan-y), 문턱 아래서 놓으면 제자리로 돌아간다.
//
// 스와이프는 포인터 이벤트 하나로 다룬다(터치·펜). 마우스는 스와이프하지 않는다 —
// 데스크톱의 가로 드래그는 HTML5 드래그가 맡는다. 새 의존성 없음.
// ---------------------------------------------------------------------------

const DIFF_TONE = {
  green: "glass-badge glass-badge-green",
  orange: "glass-badge glass-badge-orange",
  red: "glass-badge glass-badge-red",
} as const;

/** 스와이프로 드러나는 버튼 한 개의 폭·간격. 56px 정사각(iOS 메모 앱 꼴, swipeable-row.tsx 와 같다). */
const ACTION_SIZE = 56;
const ACTION_GAP = 8;
const ACTION_PAD = 12;
const ACTIONS_WIDTH = ACTION_SIZE * 2 + ACTION_GAP + ACTION_PAD * 2;
/** 이만큼 움직이기 전엔 탭·길게 누르기로 본다. */
const MOVE_SLOP = 10;
/** 길게 누르기로 연 메뉴는 손을 뗀 뒤 이만큼은 바깥 누름(pointerup→click)으로 닫히지 않는다. */
const LONG_PRESS_RELEASE_GRACE_MS = 600;
const SPRING = "transform 0.38s cubic-bezier(0.25, 0.8, 0.25, 1.05)";
const EASE = "transform 0.28s cubic-bezier(0.25, 0.1, 0.25, 1)";

const MENU_ITEM =
  "flex min-h-11 w-full cursor-default select-none items-center gap-2.5 rounded-xl px-3 text-[15px] text-[var(--apple-label)] outline-none data-highlighted:bg-[var(--apple-tertiary-system-fill)] data-disabled:opacity-40";

interface Gesture {
  pointerId: number | null;
  pointerType: string;
  startX: number;
  startY: number;
  lock: "h" | "v" | null;
  x: number;
  /** 제자리로 돌아오는 애니메이션이 끝난 뒤 swiping 을 푸는 타이머. */
  resetTimer: ReturnType<typeof setTimeout> | null;
  /** 스와이프·길게 누르기 뒤에 따라오는 click 은 상세로 가면 안 된다. */
  suppressClick: boolean;
  /** 이 시각까지는 바깥 누름으로 메뉴를 닫지 않는다(길게 누르기 → 손 떼기 → click 흡수). */
  menuGuardUntil: number;
  /** 길게 누르기로 연 뒤, 손을 떼는 순간을 잡는 문서 리스너 해제 함수. */
  releaseListener: (() => void) | null;
}

interface PlanCardProps {
  card: PlanCardData;
  /** 법인이 섞여 보일 때만 법인 이름을 단다. 한 법인만 볼 때는 줄마다 같은 말이 반복될 뿐이다. */
  showCompany?: boolean;
  /** 프로젝트 서랍 안에서는 서랍 머리가 이미 프로젝트를 말하므로 카드에서는 뺀다. */
  showProject?: boolean;
}

export function PlanCardItem({ card, showCompany = false, showProject = true }: PlanCardProps) {
  const board = usePlanBoard();
  const diff = diffBadge(card.diff, card.linkCount);
  const cancelled = card.status === "CANCELLED";
  // 취소·마감된 계획은 고칠 게 없다 — 메뉴·스와이프·드래그 전부 끈다(서버도 409 로 거부한다).
  const actionable = board !== null && card.status === "PLANNED";
  const swipeOpen = board?.swipeOpenId === card.id;
  const isDragging = board?.dragging?.id === card.id;

  const surfaceRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const gesture = useRef<Gesture>({
    pointerId: null,
    pointerType: "",
    startX: 0,
    startY: 0,
    lock: null,
    x: 0,
    resetTimer: null,
    suppressClick: false,
    menuGuardUntil: 0,
    releaseListener: null,
  });

  const [menuOpen, setMenuOpen] = useState(false);
  /** true 면 "…" 버튼에, false 면 ContextMenu 가 잡은 지점(오른쪽 클릭·길게 누르기)에 붙인다. */
  const [anchorToButton, setAnchorToButton] = useState(false);
  /**
   * 가로 제스처가 잡힌 뒤부터 제자리로 돌아올 때까지. 이때만 바깥 상자를 overflow-hidden 으로 하고
   * 뒤의 버튼을 그린다 — 평소에 그려 두면 반투명 글래스 카드 뒤로 색이 비치고, 늘 잘라 두면
   * 카드 그림자가 상자 모서리에서 끊긴다.
   */
  const [swiping, setSwiping] = useState(false);

  const setTranslate = useCallback((x: number, transition?: string) => {
    const el = surfaceRef.current;
    if (!el) return;
    el.style.transform = x === 0 ? "" : `translateX(${x}px)`;
    el.style.transition = transition ?? "none";
  }, []);

  /** 제자리 애니메이션이 끝나면 상자를 푼다. 그 사이 새 스와이프가 시작되면 취소된다. */
  const scheduleSwipeReset = useCallback(() => {
    const g = gesture.current;
    if (g.resetTimer) clearTimeout(g.resetTimer);
    g.resetTimer = setTimeout(() => {
      g.resetTimer = null;
      setSwiping(false);
    }, 400);
  }, []);

  // 다른 카드가 열리면(보드가 swipeOpenId 를 바꾸면) 이 카드는 제자리로.
  useEffect(() => {
    if (swipeOpen) return;
    setTranslate(0, EASE);
    scheduleSwipeReset();
  }, [swipeOpen, setTranslate, scheduleSwipeReset]);

  useEffect(() => {
    const g = gesture.current;
    return () => {
      if (g.resetTimer) clearTimeout(g.resetTimer);
      g.releaseListener?.();
    };
  }, []);

  // --- 포인터 제스처(터치·펜): 스와이프 --------------------------------------------------
  // 길게 누르기는 ContextMenu.Trigger(터치 500ms·10px)가 맡는다. 여기서는 잡지 않는다.

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!actionable) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const g = gesture.current;
      g.pointerId = e.pointerId;
      g.pointerType = e.pointerType;
      g.startX = e.clientX;
      g.startY = e.clientY;
      g.lock = null;
      g.x = swipeOpen ? -ACTIONS_WIDTH : 0;
      // 새로 누르면 새 의도다 — 지난 스와이프·길게 누르기가 남긴 click 억제를 푼다.
      g.suppressClick = false;
    },
    [actionable, swipeOpen],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const g = gesture.current;
      if (g.pointerId !== e.pointerId) return;
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (g.lock === null) {
        if (Math.abs(dx) < MOVE_SLOP && Math.abs(dy) < MOVE_SLOP) return;
        // 마우스의 가로 끌기는 HTML5 드래그 몫. 닫힌 카드를 오른쪽으로 미는 것도 브라우저(뒤로 가기)에 둔다.
        if (g.pointerType === "mouse" || (!swipeOpen && dx > 0)) {
          g.lock = "v";
          return;
        }
        g.lock = Math.abs(dx) > Math.abs(dy) * 1.4 ? "h" : "v";
        if (g.lock === "h") {
          surfaceRef.current?.setPointerCapture(e.pointerId);
          if (g.resetTimer) {
            clearTimeout(g.resetTimer);
            g.resetTimer = null;
          }
          setSwiping(true);
        }
      }
      if (g.lock !== "h") return;
      const base = swipeOpen ? -ACTIONS_WIDTH : 0;
      const total = base + dx;
      // 끝을 넘기면 고무줄처럼 조금만 따라온다.
      let x: number;
      if (total > 0) x = total * 0.2;
      else if (total < -ACTIONS_WIDTH) x = -ACTIONS_WIDTH + (total + ACTIONS_WIDTH) * 0.2;
      else x = total;
      g.x = x;
      setTranslate(x);
    },
    [swipeOpen, setTranslate],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const g = gesture.current;
      if (g.pointerId !== e.pointerId) return;
      g.pointerId = null;
      if (g.lock === "h") {
        g.suppressClick = true;
        if (g.x < -ACTIONS_WIDTH * 0.35) {
          board?.setSwipeOpenId(card.id);
          setTranslate(-ACTIONS_WIDTH, SPRING);
        } else {
          if (swipeOpen) board?.setSwipeOpenId(null);
          setTranslate(0, SPRING);
          scheduleSwipeReset();
        }
      }
      g.lock = null;
    },
    [board, card.id, swipeOpen, setTranslate, scheduleSwipeReset],
  );

  const onPointerCancel = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const g = gesture.current;
      if (g.pointerId !== e.pointerId) return;
      g.pointerId = null;
      g.lock = null;
      setTranslate(swipeOpen ? -ACTIONS_WIDTH : 0, EASE);
      if (!swipeOpen) scheduleSwipeReset();
    },
    [swipeOpen, setTranslate, scheduleSwipeReset],
  );

  /** 스와이프·길게 누르기 뒤의 click 은 삼킨다. 열려 있는 카드를 누르면 닫기만 한다. */
  const onClickCapture = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const g = gesture.current;
      if (g.suppressClick) {
        g.suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (swipeOpen) {
        e.preventDefault();
        e.stopPropagation();
        board?.setSwipeOpenId(null);
      }
    },
    [board, swipeOpen],
  );

  // --- HTML5 드래그(데스크톱) ---------------------------------------------------------

  const draggable = actionable && Boolean(board?.canDrag);

  const onDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!board || !draggable) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.id);
      board.setDragging({ id: card.id, month: monthKeyOf(card.plannedDate), projectId: card.projectId });
    },
    [board, draggable, card.id, card.plannedDate, card.projectId],
  );

  const onDragEnd = useCallback(() => {
    board?.setDragging(null);
  }, [board]);

  // --- 메뉴 --------------------------------------------------------------------------

  /**
   * 길게 누르기로 열렸을 때: 손을 떼는 순간(문서의 pointerup/pointercancel)부터 잠깐 더 바깥 누름을
   * 무시한다. 메뉴가 열린 뒤에는 손가락 아래가 카드가 아니라 base-ui 의 배경막일 수 있어 카드의
   * pointerup 은 믿을 수 없다 — 문서에서 잡는다.
   */
  const armLongPressGuard = useCallback(() => {
    const g = gesture.current;
    g.releaseListener?.();
    g.menuGuardUntil = Number.POSITIVE_INFINITY;
    const release = () => {
      g.menuGuardUntil = Date.now() + LONG_PRESS_RELEASE_GRACE_MS;
      g.releaseListener?.();
    };
    document.addEventListener("pointerup", release, { capture: true });
    document.addEventListener("pointercancel", release, { capture: true });
    g.releaseListener = () => {
      document.removeEventListener("pointerup", release, { capture: true });
      document.removeEventListener("pointercancel", release, { capture: true });
      g.releaseListener = null;
    };
  }, []);

  const onMenuOpenChange = useCallback(
    (open: boolean, details: ContextMenu.Root.ChangeEventDetails) => {
      const g = gesture.current;
      if (open) {
        const type = details.event?.type ?? "";
        const pointerType = (details.event as Partial<globalThis.PointerEvent> | undefined)?.pointerType;
        // 터치 길게 누르기(touchstart 로 시작) 또는 터치 contextmenu(안드로이드 크롬).
        if (type.startsWith("touch") || pointerType === "touch") {
          g.suppressClick = true;
          armLongPressGuard();
        }
        setMenuOpen(true);
        return;
      }
      if (details.reason === "outside-press" && Date.now() < g.menuGuardUntil) {
        details.cancel();
        return;
      }
      g.releaseListener?.();
      g.menuGuardUntil = 0;
      setMenuOpen(false);
      setAnchorToButton(false);
    },
    [armLongPressGuard],
  );

  const closeMenu = useCallback(() => {
    const g = gesture.current;
    g.releaseListener?.();
    g.menuGuardUntil = 0;
    setMenuOpen(false);
    setAnchorToButton(false);
  }, []);

  const showActions = swiping || swipeOpen;

  const surfaceStyle: CSSProperties = {
    touchAction: "pan-y pinch-zoom",
    WebkitTouchCallout: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
  };

  return (
    <ContextMenu.Root open={menuOpen} onOpenChange={onMenuOpenChange} disabled={!actionable}>
      <div className={cn("relative rounded-[20px]", showActions && "overflow-hidden")}>
        {/* 스와이프 뒤에 숨은 버튼. 열리기 전엔 탭 순서에서도 뺀다(키보드는 "…" 메뉴가 같은 일을 한다). */}
        {actionable && showActions && (
          <div
            className="absolute inset-y-0 right-0 flex items-center justify-center"
            style={{ width: ACTIONS_WIDTH, paddingLeft: ACTION_PAD, paddingRight: ACTION_PAD, gap: ACTION_GAP }}
            aria-hidden={!swipeOpen}
          >
            <SwipeButton
              label="수정"
              icon={<Pencil className="size-5" strokeWidth={2} aria-hidden="true" />}
              color="var(--apple-orange)"
              tabbable={swipeOpen}
              onClick={() => {
                board?.setSwipeOpenId(null);
                board?.openEdit(card);
              }}
            />
            <SwipeButton
              label="삭제"
              icon={<Trash2 className="size-5" strokeWidth={2} aria-hidden="true" />}
              color="var(--apple-red)"
              tabbable={swipeOpen}
              onClick={() => {
                board?.setSwipeOpenId(null);
                board?.openDelete(card);
              }}
            />
          </div>
        )}

        {/*
          카드 표면 = ContextMenu.Trigger(오른쪽 클릭·길게 누르기) + 스와이프 표면 + 드래그 원본.
          `isolate` 로 자기 쌓임 맥락을 만든다 — 없으면 `.glass-card > * { z-index: 1 }` 인 링크 자식이
          형제인 "…" 버튼 위에 그려져 버튼이 눌리지 않는다(QA D2-02).
        */}
        <ContextMenu.Trigger
          ref={surfaceRef}
          className={cn("relative isolate", isDragging && "opacity-40")}
          style={surfaceStyle}
          draggable={draggable || undefined}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClickCapture={onClickCapture}
        >
          <Link
            href={`/plans/${card.id}`}
            prefetch={false}
            draggable={false}
            className={cn(
              "glass-card block p-4 apple-press",
              "transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
              cancelled && "opacity-60",
              draggable && "cursor-grab active:cursor-grabbing",
            )}
          >
            {/* 법인 · 프로젝트 · 분류 — "…" 버튼 자리(오른쪽 44px)를 비워 둔다 */}
            <div className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-[var(--apple-secondary-label)]", actionable && "pr-10")}>
              {showCompany && <CompanyBadge name={card.companyName} slug={card.companySlug} />}
              <span className="truncate">
                {showProject && card.projectName}
                {showProject && " · "}
                {card.brandName ?? "공통"}
              </span>
            </div>

            <p className={cn("mt-1 text-[15px] font-semibold leading-tight text-[var(--apple-label)] truncate", actionable && "pr-10")}>
              {card.title}
            </p>
            <p className="mt-1 text-[17px] font-semibold tabular-nums text-[var(--apple-label)]">
              {formatKRW(card.amount)}
            </p>

            {/* 날짜 · 담당자 · 거래처 */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--apple-secondary-label)]">
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

          {/* 키보드·마우스용 메뉴 버튼. 링크 안에 버튼을 넣을 수 없어 형제로 띄운다(44px, z-10: 링크 자식의 z-1 위).
              포인터 이벤트는 일부러 막지 않는다 — 표면의 pointerdown 이 지난 제스처의 click 억제를 풀어야
              이 버튼의 click 이 살아남는다. */}
          {actionable && (
            <button
              ref={menuButtonRef}
              type="button"
              aria-label={`${card.title} 빠른 메뉴`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => {
                setAnchorToButton(true);
                setMenuOpen(true);
              }}
              className={cn(
                "absolute right-1.5 top-1.5 z-10 flex size-11 items-center justify-center rounded-full text-[var(--apple-secondary-label)] transition-colors hover:bg-[var(--apple-tertiary-system-fill)] hover:text-[var(--apple-label)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--apple-blue)]",
                menuOpen && "bg-[var(--apple-tertiary-system-fill)] text-[var(--apple-label)]",
              )}
            >
              <Ellipsis className="size-5" aria-hidden="true" />
            </button>
          )}
        </ContextMenu.Trigger>
      </div>

      {actionable && board && (
        <ContextMenu.Portal>
          <ContextMenu.Positioner
            // undefined 면 ContextMenu 가 잡은 지점(오른쪽 클릭·길게 누르기)에 붙는다.
            anchor={anchorToButton ? menuButtonRef : undefined}
            side="bottom"
            align={anchorToButton ? "end" : "start"}
            sideOffset={4}
            className="isolate z-50 outline-none"
          >
            <ContextMenu.Popup
              aria-label={`${card.title} 빠른 메뉴`}
              className="glass-strong min-w-48 origin-(--transform-origin) rounded-2xl p-1.5 outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0"
            >
              <ContextMenu.Item
                className={MENU_ITEM}
                onClick={() => {
                  closeMenu();
                  board.openEdit(card);
                }}
              >
                <Pencil className="size-4 text-[var(--apple-secondary-label)]" aria-hidden="true" />
                수정
                <span className="ml-auto text-caption2 text-[var(--apple-tertiary-label)]">날짜 바꾸기</span>
              </ContextMenu.Item>
              <ContextMenu.Item
                className={MENU_ITEM}
                onClick={() => {
                  closeMenu();
                  board.shiftMonth(card.id, -1);
                }}
              >
                <ChevronLeft className="size-4 text-[var(--apple-secondary-label)]" aria-hidden="true" />
                이전 달로
              </ContextMenu.Item>
              <ContextMenu.Item
                className={MENU_ITEM}
                onClick={() => {
                  closeMenu();
                  board.shiftMonth(card.id, 1);
                }}
              >
                <ChevronRight className="size-4 text-[var(--apple-secondary-label)]" aria-hidden="true" />
                다음 달로
              </ContextMenu.Item>
              <ContextMenu.Separator className="my-1 h-px bg-[var(--apple-separator)]" />
              <ContextMenu.Item
                className={cn(MENU_ITEM, "text-[var(--apple-red)] data-highlighted:bg-[var(--apple-red)]/10")}
                onClick={() => {
                  closeMenu();
                  board.openDelete(card);
                }}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                삭제
              </ContextMenu.Item>
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      )}
    </ContextMenu.Root>
  );
}

// ---------------------------------------------------------------------------

function SwipeButton({
  label,
  icon,
  color,
  tabbable,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  color: string;
  tabbable: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={tabbable ? 0 : -1}
      aria-label={label}
      className="flex flex-col items-center justify-center gap-1.5 rounded-2xl text-white shadow-sm transition-all duration-150 active:scale-90 active:opacity-80"
      style={{ width: ACTION_SIZE, height: ACTION_SIZE, backgroundColor: color }}
    >
      <span className="flex size-[22px] items-center justify-center">{icon}</span>
      <span className="text-[10px] font-semibold leading-none tracking-tight">{label}</span>
    </button>
  );
}
