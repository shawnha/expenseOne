"use client";

import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** 호점 구분 필터 (마트/약국). 값 없음 = 전체. "none" = 미지정만. */
const OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "STORE_1", label: "1호점" },
  { value: "STORE_2", label: "2호점" },
  { value: "none", label: "미지정" },
];

export function BranchFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const active = searchParams.get("branch") ?? "all";

  const apply = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === "all") {
        params.delete("branch");
      } else {
        params.set("branch", value);
      }
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="glass p-2 flex items-center gap-1.5 overflow-x-auto">
      <span className="shrink-0 pl-1 pr-0.5 text-footnote text-[var(--apple-secondary-label)]">
        호점
      </span>
      {OPTIONS.map((o) => {
        const isActive = active === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => apply(o.value)}
            aria-pressed={isActive}
            className={cn(
              "shrink-0 h-8 rounded-full px-3.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,122,255,0.4)]",
              isActive
                ? "bg-[var(--apple-blue)] text-white"
                : "text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.06)]",
            )}
          >
            {o.label}
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
