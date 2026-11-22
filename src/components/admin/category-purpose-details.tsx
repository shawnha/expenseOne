"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { expensePurposeLabel, type ExpensePurpose, type ExpenseSpendView } from "@/lib/admin/expense-purpose";
import { formatAmount } from "@/lib/validations/expense-form";
import type { getCategoryPurposeBreakdown } from "@/services/expense-purpose.service";

type Breakdown = Awaited<ReturnType<typeof getCategoryPurposeBreakdown>>;

export function CategoryPurposeDetails({ category, startDate, endDate, company, view }: {
  category: string;
  startDate: string;
  endDate: string;
  company: string;
  view: ExpenseSpendView;
}) {
  const [result, setResult] = useState<Breakdown | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ category, startDate, endDate, view });
    if (company) params.set("company", company);
    const timeout = window.setTimeout(() => {
      controller.abort();
      setFailed(true);
    }, 10_000);
    fetch(`/api/admin/dashboard/category-purposes?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const { data } = await response.json();
        if (!controller.signal.aborted) setResult(data);
      }).catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      }).finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [category, startDate, endDate, company, view, attempt]);

  function listHref(purpose: ExpensePurpose | null, range: Breakdown["range"]) {
    const params = new URLSearchParams({
      category, purpose: purpose ?? "unclassified", spendView: view,
      status: "APPROVED", startDate: range.startDate, endDate: range.endDate,
    });
    if (company) params.set("company", company);
    return `/admin/expenses?${params}`;
  }

  return (
    <div className="mb-1 ml-5 border-l border-[var(--apple-separator)] pl-3">
      <p className="pt-2 text-xs font-medium text-[var(--apple-secondary-label)]">비용 성격별 내역</p>
      {failed ? (
        <div className="flex flex-wrap items-center gap-1">
          <p className="text-sm" role="status">세부 내역을 불러오지 못했습니다.</p>
          <Button type="button" variant="link" size="lg" onClick={() => {
            setFailed(false);
            setAttempt((value) => value + 1);
          }}>다시 시도</Button>
        </div>
      ) : !result ? (
        <p className="py-3 text-sm text-[var(--apple-secondary-label)]" role="status">불러오는 중…</p>
      ) : result.items.length === 0 ? (
        <p className="py-3 text-sm text-[var(--apple-secondary-label)]">해당하는 비용이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-[var(--apple-separator)]">
          {result.items.map(({ purpose, amount, count }) => (
            <li key={purpose ?? "unclassified"}>
              <Link href={listHref(purpose, result.range)} prefetch={false} className="flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg px-1 py-2 text-sm hover:bg-[var(--apple-tertiary-system-fill)] focus-visible:outline-2 focus-visible:outline-[var(--apple-blue)]">
                <span className="text-[var(--apple-label)]">{expensePurposeLabel(purpose)} <span className="text-xs text-[var(--apple-secondary-label)]">{count}건</span></span>
                <span className="flex items-center gap-1 font-semibold tabular-nums text-[var(--apple-blue)]">
                  {amount < 0 ? "−" : ""}{formatAmount(Math.abs(amount))}원
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
