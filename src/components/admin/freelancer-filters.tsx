"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { getPeriodDates, type PeriodPreset } from "@/lib/utils/report-periods";
import { cn } from "@/lib/utils";

/** 사업소득 집계에 어울리는 기간 프리셋 (연간 신고가 기본이라 '올해'를 디폴트로) */
const PRESETS: { value: PeriodPreset | "all"; label: string }[] = [
  { value: "this_year", label: "올해" },
  { value: "last_6_months", label: "최근 6개월" },
  { value: "this_month", label: "이번 달" },
  { value: "last_month", label: "지난 달" },
  { value: "all", label: "전체" },
];

export function FreelancerFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const active = searchParams.get("period") ?? "this_year";

  const applyPreset = useCallback(
    (preset: PeriodPreset | "all") => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("period", preset);
      if (preset === "all") {
        params.delete("startDate");
        params.delete("endDate");
      } else {
        const { current } = getPeriodDates(preset);
        params.set("startDate", current.startDate);
        params.set("endDate", current.endDate);
      }
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="glass p-2 flex items-center gap-1.5 overflow-x-auto">
      {PRESETS.map((p) => {
        const isActive = active === p.value;
        return (
          <button
            key={p.value}
            type="button"
            onClick={() => applyPreset(p.value)}
            aria-pressed={isActive}
            className={cn(
              "shrink-0 h-8 rounded-full px-3.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,122,255,0.4)]",
              isActive
                ? "bg-[var(--apple-blue)] text-white"
                : "text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.06)]",
            )}
          >
            {p.label}
          </button>
        );
      })}
      {isPending && (
        <span className="ml-1 text-xs text-[var(--apple-blue)] animate-pulse font-medium shrink-0">
          불러오는 중...
        </span>
      )}
    </div>
  );
}
