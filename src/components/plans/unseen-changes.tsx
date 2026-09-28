"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { describeChange, type ChangeEntry } from "@/lib/plans/changes";
import { requestNavBadgesRefresh } from "@/components/layout/use-nav-badges";
import type { PlanUnseenChanges } from "@/services/plan.service";
import { formatStamp, jsonBody, planFetch } from "./plan-client";

// ---------------------------------------------------------------------------
// 계획 상세 맨 위 "지난번 보신 뒤 바뀐 내용"(0027). 다른 사람이 바꾼 것을 이전 → 이후로 보여 준 뒤,
// 이 계획을 **봤다고** 기록한다(POST …/seen). 그래서 다음에 열면 이 상자는 없다 — 대신 아래 이력에는 남는다.
// 기록은 그린 뒤에 남긴다: 먼저 남기면 보드·메뉴 숫자가 무엇이 바뀌었는지 보기도 전에 사라진다.
// ---------------------------------------------------------------------------

export function UnseenChanges({
  planId,
  unseen,
  currentPrecision,
}: {
  planId: string;
  unseen: PlanUnseenChanges;
  currentPrecision: string;
}) {
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void planFetch(`/api/plans/items/${planId}/seen`, jsonBody({})).then(() => requestNavBadgesRefresh());
  }, [planId]);

  // 최근 것부터
  const entries: ChangeEntry[] = [...unseen.entries].reverse();

  return (
    <section
      aria-label="지난번 보신 뒤 바뀐 내용"
      className="rounded-2xl border border-[var(--apple-orange)]/25 bg-[var(--apple-orange)]/10 p-4 sm:p-5 animate-fade-up"
    >
      <h2 className="flex items-center gap-2 text-subheadline font-semibold text-[var(--apple-label)]">
        <Sparkles className="size-4 text-[var(--apple-orange)]" aria-hidden="true" />
        지난번 보신 뒤 바뀐 내용 <span className="tabular-nums text-[var(--apple-secondary-label)]">{entries.length}</span>
      </h2>
      <ol className="mt-3 space-y-3">
        {entries.map((e, i) => {
          const d = describeChange(e, { names: unseen.names, currentPrecision });
          return (
            <li key={`${e.at}-${i}`} className="rounded-xl bg-[var(--glass-bg-subtle)] px-3 py-2.5">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-footnote font-semibold text-[var(--apple-label)]">
                  {d.title}
                  {e.actorName && <span className="font-normal text-[var(--apple-secondary-label)]"> · {e.actorName}</span>}
                </span>
                <span className="text-caption2 tabular-nums text-[var(--apple-secondary-label)]">{formatStamp(e.at)}</span>
              </p>
              {d.lines.length > 0 && (
                <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-footnote">
                  {d.lines.map((l) => (
                    <div key={l.label} className="contents">
                      <dt className="text-[var(--apple-secondary-label)]">{l.label}</dt>
                      <dd className="flex min-w-0 flex-wrap items-center gap-1.5 break-words text-[var(--apple-label)]">
                        {l.before !== undefined && (
                          <>
                            <span className="text-[var(--apple-secondary-label)] line-through decoration-[var(--apple-red)]/60">
                              {l.before}
                            </span>
                            <ArrowRight className="size-3.5 shrink-0 text-[var(--apple-tertiary-label)]" aria-label="에서" />
                          </>
                        )}
                        <span className="font-semibold">{l.after ?? ""}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
