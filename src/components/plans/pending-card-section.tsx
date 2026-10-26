"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CARD_BATCH_MAX, type PendingCardTxList } from "@/lib/card-batch/types";
import { planCardWindow } from "@/lib/card-batch/plan-card-window";
import { formatMonthDay, kstDateString } from "@/lib/card-batch/ui";
import { formatKRW } from "@/lib/utils/expense-utils";

/** 미등록 결제는 검색 대상인 기존 비용과 분리한다. 여기서는 등록 폼으로만 이동한다. */
export function PendingCardSection({ planId, plannedDate }: { planId: string; plannedDate: string }) {
  const router = useRouter();
  const [window] = useState(() => planCardWindow(plannedDate, kstDateString(new Date())));
  const [data, setData] = useState<PendingCardTxList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const query = new URLSearchParams(window);
        const res = await fetch(`/api/card-transactions/pending?${query}`, { signal: controller.signal });
        const json = await res.json();
        if (!res.ok || !json?.data?.items) throw new Error();
        if (alive) setData(json.data);
      } catch {
        if (alive) setError("결제 내역을 불러오지 못했습니다.");
      }
    })();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [window, attempt]);

  const handleContinue = () => {
    const picked = (data?.items ?? []).filter((item) => selected.has(item.id));
    if (picked.length === 1) {
      router.push(`/expenses/new/corporate-card?gowidTxId=${picked[0].id}&plan=${planId}`);
    } else if (picked.length > 1) {
      // 지난 계획이면 「오늘까지」가 62일을 넘어 기본 14일로 돌아간다 — 고른 결제가 보이도록 종료일도 넘긴다.
      const dates = picked.map((item) => item.date).sort();
      router.push(
        `/expenses/new/card-batch?plan=${planId}&from=${dates[0]}&to=${dates[dates.length - 1]}&ids=${picked.map((item) => item.id).join(",")}`,
      );
    }
  };

  return (
    <section className="space-y-3 border-b border-[var(--apple-separator)] pb-5" aria-labelledby="pending-card-heading">
      <div>
        <h3 id="pending-card-heading" className="text-subheadline font-semibold text-[var(--apple-label)]">아직 안 올린 법카 결제</h3>
        <p className="mt-1 text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
          {formatMonthDay(window.from)}~{formatMonthDay(window.to)} 결제
        </p>
      </div>
      {error ? (
        <div className="flex items-center gap-2 text-footnote text-[var(--apple-secondary-label)]" role="status">
          <p>{error}</p>
          <button type="button" className="min-h-11 shrink-0 rounded-full px-3 text-[var(--apple-blue)]" onClick={() => { setError(null); setAttempt((n) => n + 1); }}>다시 시도</button>
        </div>
      ) : data === null ? (
        <p role="status" className="py-3 text-footnote text-[var(--apple-secondary-label)]">결제 내역을 불러오는 중입니다…</p>
      ) : data.items.length === 0 ? (
        <p className="py-3 text-footnote text-[var(--apple-secondary-label)]">이 기간에 아직 안 올린 법카 결제가 없습니다.</p>
      ) : (
        <ul className="max-h-[28dvh] space-y-2 overflow-y-auto px-1 py-0.5">
          {data.items.map((item) => (
            <li key={item.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[var(--apple-separator)] px-3 py-2.5 hover:bg-[var(--apple-tertiary-system-fill)]">
                <Checkbox
                  checked={selected.has(item.id)}
                  disabled={!selected.has(item.id) && selected.size >= CARD_BATCH_MAX}
                  onCheckedChange={(checked) => setSelected((cur) => {
                    const next = new Set(cur);
                    if (checked && next.size < CARD_BATCH_MAX) next.add(item.id);
                    else next.delete(item.id);
                    return next;
                  })}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-footnote font-medium text-[var(--apple-label)]">{item.storeName || "가맹점 정보 없음"}</span>
                  <span className="block text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
                    {formatMonthDay(item.date)}{item.time ? ` ${item.time}` : ""}{item.cardLastFour ? ` · 카드 ${item.cardLastFour}` : ""}
                  </span>
                  {item.possibleDuplicate && <span className="glass-badge glass-badge-orange mt-1 inline-block">이미 올렸을 수 있음</span>}
                </span>
                <span className="shrink-0 text-footnote font-semibold tabular-nums text-[var(--apple-label)]">{formatKRW(item.amount)}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {data?.truncated && <p className="text-caption2 text-[var(--apple-secondary-label)]">결제가 많아 일부만 표시했습니다. 한 번에 올리기 화면에서 기간을 좁혀 확인해주세요.</p>}
      {!!data?.items.length && (
        <Button type="button" onClick={handleContinue} disabled={selected.size === 0} className="h-11 w-full rounded-full">
          선택한 {selected.size}건 올리고 연결
        </Button>
      )}
    </section>
  );
}
