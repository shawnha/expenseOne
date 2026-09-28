"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellDot, CheckCheck, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CHANGE_KIND_LABEL, changeShortText, type ChangeKind } from "@/lib/plans/changes";
import { requestNavBadgesRefresh } from "@/components/layout/use-nav-badges";
import type { UnseenPlanSummary } from "@/services/plan.service";
import { formatStamp, jsonBody, planFetch } from "./plan-client";
import { useSubmitLock } from "./use-submit-lock";

// ---------------------------------------------------------------------------
// 보드 맨 위 "지난번 보신 뒤 바뀐 계획"(0027). 오너 요청(2026-09-28): 비용계획은 무엇이 추가·변경됐는지가
// 매우 중요하다. 보이는 달과 상관없이 전부 모아 보여 주고(다른 달·취소된 계획도), 줄을 누르면 상세로 간다 —
// 상세가 이전 → 이후를 보여 주고 그 계획의 표시를 지운다. 「모두 확인함」은 한 번에 지운다.
// ---------------------------------------------------------------------------

const PILL: Record<ChangeKind, string> = {
  NEW: "glass-badge glass-badge-blue",
  UPDATED: "glass-badge glass-badge-orange",
  CANCELLED: "glass-badge glass-badge-gray",
};

const PREVIEW = 5;

export function ChangeBanner({ summary }: { summary: UnseenPlanSummary }) {
  const router = useRouter();
  const withLock = useSubmitLock();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const markAll = useCallback(
    () =>
      withLock(async () => {
        setBusy(true);
        const res = await planFetch("/api/plans/seen-all", jsonBody({}));
        setBusy(false);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        toast.success("모두 확인함으로 표시했습니다.");
        requestNavBadgesRefresh();
        router.refresh();
      }),
    [withLock, router],
  );

  if (summary.total === 0) return null;

  const rows = expanded ? summary.items : summary.items.slice(0, PREVIEW);
  const hidden = summary.items.length - rows.length;
  const kinds = (["NEW", "UPDATED", "CANCELLED"] as const).filter((k) => summary.counts[k] > 0);

  return (
    <section
      aria-label="지난번 보신 뒤 바뀐 계획"
      className="rounded-2xl border border-[var(--apple-orange)]/25 bg-[var(--apple-orange)]/10 p-4 sm:p-5 animate-fade-up"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-subheadline font-semibold text-[var(--apple-label)]">
            <BellDot className="size-5 text-[var(--apple-orange)]" aria-hidden="true" />
            지난번 보신 뒤 바뀐 계획 <span className="tabular-nums">{summary.total}건</span>
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {kinds.map((k) => (
              <span key={k} className={PILL[k]}>
                {CHANGE_KIND_LABEL[k]} {summary.counts[k]}
              </span>
            ))}
          </div>
          <p className="mt-2 text-caption1 text-[var(--apple-secondary-label)]">
            보드에서는 색 테두리 카드가 바뀐 계획입니다. 열면 무엇이 → 무엇으로 바뀌었는지 보이고 표시가 사라집니다.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void markAll()}
          className="min-h-11 shrink-0 rounded-full"
        >
          <CheckCheck className="size-4" aria-hidden="true" />
          {busy ? "처리 중…" : "모두 확인함"}
        </Button>
      </div>

      <ul className="mt-3 divide-y divide-[var(--apple-separator)] overflow-hidden rounded-xl bg-[var(--glass-bg-subtle)]">
        {rows.map((it) => (
          <li key={it.planId}>
            <Link
              href={`/plans/${it.planId}`}
              prefetch={false}
              className="flex min-h-14 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--apple-tertiary-system-fill)]"
            >
              <span className={cn(PILL[it.mark.kind], "shrink-0 whitespace-nowrap")}>{changeShortText(it.mark)}</span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[14px] font-medium text-[var(--apple-label)]",
                    it.status === "CANCELLED" && "line-through decoration-[var(--apple-secondary-label)]",
                  )}
                >
                  {it.title}
                </span>
                <span className="block truncate text-caption2 text-[var(--apple-secondary-label)]">
                  {it.projectName} · {it.plannedDateLabel}
                  {it.mark.actorName ? ` · ${it.mark.actorName}` : ""} · {formatStamp(it.mark.at)}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-[var(--apple-tertiary-label)]" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      {(hidden > 0 || expanded) && summary.items.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-footnote font-medium text-[var(--apple-blue)] hover:bg-[var(--apple-blue)]/10"
        >
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
          {expanded ? "접기" : `${hidden}건 더 보기`}
        </button>
      )}
      {summary.total > summary.items.length && (
        <p className="mt-1 text-caption2 text-[var(--apple-secondary-label)]">
          최근 {summary.items.length}건만 보입니다. 「모두 확인함」 뒤에는 새로 바뀐 것만 뜹니다.
        </p>
      )}
    </section>
  );
}
