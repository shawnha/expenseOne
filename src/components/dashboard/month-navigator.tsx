"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${y}년 ${parseInt(m)}월`;
}

function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthNavigator() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const month = searchParams.get("month") ?? getCurrentMonthKey();
  const isCurrentMonth = month === getCurrentMonthKey();

  function navigate(newMonth: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (newMonth === getCurrentMonthKey()) {
      params.delete("month");
    } else {
      params.set("month", newMonth);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label="월 선택">
      <button
        type="button"
        onClick={() => navigate(shiftMonth(month, -1))}
        className="size-8 flex items-center justify-center rounded-full text-[var(--apple-secondary-label)] hover:bg-[var(--apple-fill)] transition-colors apple-press"
        aria-label="이전 달"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-3 py-1 rounded-full bg-[var(--apple-blue)] text-white text-[13px] font-semibold min-w-[100px] text-center">
        {formatMonthLabel(month)}
      </span>
      <button
        type="button"
        onClick={() => !isCurrentMonth && navigate(shiftMonth(month, 1))}
        disabled={isCurrentMonth}
        className="size-8 flex items-center justify-center rounded-full text-[var(--apple-secondary-label)] hover:bg-[var(--apple-fill)] transition-colors apple-press disabled:opacity-30 disabled:pointer-events-none"
        aria-label="다음 달"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
