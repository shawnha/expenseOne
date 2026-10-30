"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Check, ChevronDown, Link2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPickDate, pickAmountLabel } from "@/lib/plans/pick-ui";
import type { PlanPick } from "@/services/plan-picks.service";

// ---------------------------------------------------------------------------
// 입금요청·법카 폼에서 비용계획을 고르는 조각들.
//
// 이 파일은 계획 서비스·DB 풀을 import 하지 않는다(타입만 가져온다 — 컴파일 때 사라진다).
// 계획 데이터는 HTTP(/api/plans/**)로만 읽는다. 스위치가 꺼졌거나 권한이 없으면 404 라서
// 조용히 아무것도 그리지 않는다.
// ---------------------------------------------------------------------------

export type { PlanPick };

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    // 세션이 끊기면 /login HTML 이 200 으로 온다 — JSON 이 아니면 없는 것으로 본다.
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    const json = (await res.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
}

/** 내가 참여한 프로젝트 계획 / (대표만) 참여하지 않은 프로젝트 계획. 실패·404 는 빈 목록. */
export function usePlanPicks(enabled: boolean): { mine: PlanPick[]; others: PlanPick[] } {
  const [state, setState] = useState<{ mine: PlanPick[]; others: PlanPick[] }>({ mine: [], others: [] });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void getJson<{ mine: PlanPick[]; others: PlanPick[] }>("/api/plans/picks").then((data) => {
      if (alive && data) setState({ mine: data.mine ?? [], others: data.others ?? [] });
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return state;
}

export type PreselectStatus = "idle" | "pending" | "loaded" | "missing";

/**
 * ?plan= 으로 들어왔을 때 그 계획 한 건. 상태를 돌려줘서 폼이 응답 전에는 목록을 숨기고(깜빡임 방지),
 * 못 불러왔을 때 안내할 수 있게 한다.
 */
export function usePreselectedPlan(
  planId: string | undefined,
  handlers: { onLoaded: (pick: PlanPick) => void; onMissing?: () => void },
): PreselectStatus {
  const [state, setState] = useState<{ id: string | undefined; status: PreselectStatus }>({
    id: planId,
    status: planId ? "pending" : "idle",
  });
  useEffect(() => {
    if (!planId) return;
    let alive = true;
    void getJson<{ pick: PlanPick | null }>(`/api/plans/items/${planId}/pick`).then((data) => {
      if (!alive) return;
      if (data?.pick) {
        handlers.onLoaded(data.pick);
        setState({ id: planId, status: "loaded" });
      } else {
        handlers.onMissing?.();
        setState({ id: planId, status: "missing" });
      }
    });
    return () => {
      alive = false;
    };
    // handlers 는 마운트 시 한 번만 쓴다 — 의존성에 넣으면 폼이 다시 그려질 때마다 재조회한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);
  if (!planId) return "idle";
  return state.id === planId ? state.status : "pending";
}

/** GoWid 결제에 맞는 계획 후보. 조건이 모자라면 조회하지 않는다. */
export function useCardSuggestions(params: {
  companyId: string | null | undefined;
  amount: number | undefined;
  date: string | undefined;
  merchant: string | null | undefined;
}): PlanPick[] {
  const { companyId, amount, date, merchant } = params;
  // 조건(회사·금액·날짜·가맹점)이 바뀌면 이전 조건의 후보는 버린다 — 키가 다르면 빈 목록.
  const key = `${companyId ?? ""}|${amount ?? ""}|${date ?? ""}|${merchant ?? ""}`;
  const [state, setState] = useState<{ key: string; list: PlanPick[] }>({ key: "", list: [] });
  useEffect(() => {
    if (!companyId || !amount || !date) return;
    let alive = true;
    const q = new URLSearchParams({ companyId, amount: String(amount), date });
    if (merchant) q.set("merchant", merchant);
    void getJson<{ suggestions: PlanPick[] }>(`/api/plans/card-suggestions?${q.toString()}`).then((data) => {
      if (alive) setState({ key, list: data?.suggestions ?? [] });
    });
    return () => {
      alive = false;
    };
    // key 는 위 다섯 값의 합성이라 따로 넣지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, amount, date, merchant]);
  return state.key === key ? state.list : EMPTY_PICKS;
}

const EMPTY_PICKS: PlanPick[] = [];

/**
 * "비용계획 「…」에 연결됩니다" 칩. × 는 연결만 풀고 채워진 칸은 그대로 둔다.
 * focusOnMount: 사용자가 목록에서 골라 칩으로 바뀐 직후, 사라진 행 대신 × 로 포커스를 옮긴다.
 * warning: 연결이 실제로는 안 될 때(법인 불일치) 칩 아래에 보여 주는 안내.
 */
export function PlanLinkedChip({
  title,
  onCancel,
  focusOnMount = false,
  warning,
}: {
  title: string;
  onCancel: () => void;
  focusOnMount?: boolean;
  warning?: string | null;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusOnMount) cancelRef.current?.focus();
    // 마운트 때 한 번만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div>
      <div
        role="status"
        className="flex items-center gap-2 rounded-2xl border border-[rgba(52,199,89,0.3)] bg-[rgba(52,199,89,0.1)] py-1.5 pl-3.5 pr-1.5"
      >
        <Link2 className="size-4 shrink-0 text-[var(--apple-green)]" aria-hidden="true" />
        <p className="flex min-w-0 flex-1 text-[13px] font-medium text-[var(--apple-label)]">
          <span className="shrink-0">비용계획 「</span>
          <span className="min-w-0 truncate">{title}</span>
          <span className="shrink-0">」에 연결됩니다</span>
        </p>
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          aria-label="비용계획 연결 해제"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--apple-secondary-label)] transition-colors hover:text-[var(--apple-label)] apple-press"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {warning && (
        <p role="alert" className="mt-2 px-1 text-[13px] text-[var(--apple-red)]">
          {warning}
        </p>
      )}
    </div>
  );
}

function PickRow({
  pick,
  selected,
  showOwner,
  onToggle,
  className,
}: {
  pick: PlanPick;
  selected: boolean;
  showOwner?: boolean;
  onToggle: (pick: PlanPick) => void;
  className?: string;
}) {
  const meta = [formatPickDate(pick.plannedDate, pick.datePrecision), pick.projectName, showOwner ? pick.ownerName : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className={className}>
      <button
        type="button"
        onClick={() => onToggle(pick)}
        aria-pressed={selected}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors apple-press",
          selected
            ? "border-[var(--apple-blue)] bg-[rgba(0,122,255,0.08)]"
            : "border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)] hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.06)]",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-[var(--apple-label)]">{pick.title}</p>
          <p className="mt-0.5 truncate text-[12px] text-[var(--apple-secondary-label)]">{meta}</p>
        </div>
        <span className="shrink-0 text-[13px] font-medium tabular-nums text-[var(--apple-secondary-label)]">
          {pickAmountLabel(pick.amount)}
        </span>
        {selected && <Check className="size-4 shrink-0 text-[var(--apple-blue)]" aria-hidden="true" />}
      </button>
    </li>
  );
}

/** 입금요청 폼 맨 위 — 「내 비용계획에서 불러올까요?」. 둘 다 비어 있으면 아무것도 그리지 않는다. */
export function PlanPickPanel({
  mine,
  others,
  selectedId,
  onSelect,
  focusHeadingOnMount = false,
}: {
  mine: PlanPick[];
  others: PlanPick[];
  selectedId: string | null;
  onSelect: (pick: PlanPick) => void;
  /** 연결을 풀어 목록이 다시 나타났을 때 포커스를 제목으로 돌려 준다. */
  focusHeadingOnMount?: boolean;
}) {
  const [showAllMine, setShowAllMine] = useState(false);
  const [othersToggled, setOthersToggled] = useState(false);
  const [showAllOthers, setShowAllOthers] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeadingOnMount) headingRef.current?.focus();
    // 마운트 때 한 번만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (mine.length === 0 && others.length === 0) return null;

  // 참여하지 않은 프로젝트 계획(대표만 보임)은 처음에는 한 줄로 접어 둔다 — 증빙 첨부를 화면 밖으로 밀어내지 않게.
  const onlyOthers = mine.length === 0;
  const othersOpen = othersToggled;
  const visibleMine = showAllMine ? mine : mine.slice(0, 3);
  const visibleOthers = showAllOthers ? others : others.slice(0, 3);
  const panelCopy = "고르면 제목·회사·납기일을 채우고 이 계획에 연결합니다. 금액은 서류가 있으면 서류 금액을 씁니다.";
  const othersToggle = (
    <button
      type="button"
      onClick={() => setOthersToggled((v) => !v)}
      aria-expanded={othersOpen}
      aria-controls="plan-pick-others"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]"
    >
      다른 프로젝트 계획에서 불러오기 ({others.length})
      <ChevronDown className={cn("size-4 transition-transform", othersOpen && "rotate-180")} aria-hidden="true" />
    </button>
  );
  return (
    <section className={cn("glass", onlyOthers ? "px-2 py-1" : "p-5")} aria-labelledby="plan-pick-heading">
      <div className={cn("flex items-center gap-2", !onlyOthers && "mb-3")}>
        {!onlyOthers && <CalendarClock className="size-4 text-[var(--apple-blue)]" aria-hidden="true" />}
        <h2
          id="plan-pick-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-subheadline font-semibold text-[var(--apple-label)] outline-none"
        >
          {onlyOthers ? othersToggle : "내 비용계획에서 불러올까요?"}
        </h2>
      </div>
      {(!onlyOthers || othersOpen) && (
        <p className={cn("mb-3 text-footnote text-[var(--apple-secondary-label)]", onlyOthers && "px-3 pt-2")}>
          {panelCopy}
        </p>
      )}

      {mine.length > 0 && (
        <ul className="space-y-2">
          {visibleMine.map((p, index) => (
            <PickRow key={p.id} pick={p} selected={p.id === selectedId} showOwner={!p.ownedByMe} onToggle={onSelect}
              className={!showAllMine && index === 2 ? "hidden sm:block" : undefined} />
          ))}
        </ul>
      )}
      {mine.length > 2 && (
        <button
          type="button"
          onClick={() => setShowAllMine((v) => !v)}
          aria-expanded={showAllMine}
          className={cn("mt-2 inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-medium text-[var(--apple-blue)]", mine.length === 3 && !showAllMine && "sm:hidden")}
        >
          {showAllMine ? "접기" : <><span className="sm:hidden">더 보기 ({mine.length - 2})</span><span className="hidden sm:inline">더 보기 ({mine.length - 3})</span></>}
        </button>
      )}

      {others.length > 0 && (
        <div className={onlyOthers ? undefined : "mt-3"}>
          {!onlyOthers && othersToggle}
          <div id="plan-pick-others" hidden={!othersOpen} className={cn(onlyOthers ? "px-3 pb-3" : "mt-1")}>
            <ul className="space-y-2">
              {visibleOthers.map((p) => (
                <PickRow key={p.id} pick={p} selected={p.id === selectedId} showOwner onToggle={onSelect} />
              ))}
            </ul>
            {others.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllOthers((v) => !v)}
                aria-expanded={showAllOthers}
                className="mt-2 inline-flex min-h-11 items-center rounded-full px-3 text-[13px] font-medium text-[var(--apple-blue)]"
              >
                {showAllOthers ? "접기" : `더 보기 (${others.length - 3})`}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** 법카 폼 — 「이 결제, 비용계획에 연결할까요?」. 한 건만 고르고, 다시 누르면 해제. */
export function CardPlanSuggestions({
  suggestions,
  selectedId,
  onToggle,
}: {
  suggestions: PlanPick[];
  selectedId: string | null;
  onToggle: (pick: PlanPick) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <section className="glass p-5" aria-labelledby="card-plan-heading">
      <div className="mb-3 flex items-center gap-2">
        <Link2 className="size-4 text-[var(--apple-blue)]" aria-hidden="true" />
        <h2 id="card-plan-heading" className="text-subheadline font-semibold text-[var(--apple-label)]">
          이 결제, 비용계획에 연결할까요?
        </h2>
      </div>
      <p className="mb-3 text-footnote text-[var(--apple-secondary-label)]">
        고르면 제출할 때 이 결제를 그 계획에 연결합니다. 다시 누르면 해제됩니다.
      </p>
      <ul className="space-y-2">
        {suggestions.map((p) => (
          <PickRow key={p.id} pick={p} selected={p.id === selectedId} showOwner={!p.mine} onToggle={onToggle} />
        ))}
      </ul>
    </section>
  );
}
