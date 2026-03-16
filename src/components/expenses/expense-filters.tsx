"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CATEGORY_OPTIONS } from "@/lib/validations/expense-form";

function getDefaultDateRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return {
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

const TYPE_OPTIONS = [
  { value: "", label: "전체 유형" },
  { value: "CORPORATE_CARD", label: "법카사용" },
  { value: "DEPOSIT_REQUEST", label: "입금요청" },
];

const STATUS_OPTIONS = [
  { value: "", label: "전체 상태" },
  { value: "SUBMITTED", label: "제출" },
  { value: "APPROVED", label: "승인" },
  { value: "REJECTED", label: "반려" },
  { value: "CANCELLED", label: "취소" },
];

const ALL_CATEGORY_OPTIONS = [
  { value: "", label: "전체 카테고리" },
  ...CATEGORY_OPTIONS,
];

export function ExpenseFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const defaults = useMemo(() => getDefaultDateRange(), []);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const createQueryString = useCallback(
    (params: Record<string, string | null>) => {
      const current = new URLSearchParams(searchParams.toString());
      Object.entries(params).forEach(([key, value]) => {
        if (value === null || value === "") {
          current.delete(key);
        } else {
          current.set(key, value);
        }
      });
      current.delete("page");
      return current.toString();
    },
    [searchParams]
  );

  const handleFilterChange = useCallback(
    (key: string, value: string) => {
      startTransition(() => {
        const qs = createQueryString({ [key]: value || null });
        router.push(`${pathname}${qs ? `?${qs}` : ""}`);
      });
    },
    [createQueryString, pathname, router]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        startTransition(() => {
          const qs = createQueryString({ search: value || null });
          router.push(`${pathname}${qs ? `?${qs}` : ""}`);
        });
      }, 300);
    },
    [createQueryString, pathname, router]
  );

  const handleDateChange = useCallback(
    (key: "startDate" | "endDate", value: string) => {
      startTransition(() => {
        const qs = createQueryString({ [key]: value || null });
        router.push(`${pathname}${qs ? `?${qs}` : ""}`);
      });
    },
    [createQueryString, pathname, router]
  );

  const selectClassName =
    "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50 w-full sm:w-auto";

  const hasActiveFilters = !!(
    searchParams.get("type") ||
    searchParams.get("status") ||
    searchParams.get("category")
  );

  return (
    <div
      className="glass p-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
      role="search"
      aria-label="비용 필터"
    >
      {/* Search bar + mobile filter toggle */}
      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--apple-secondary-label)]" />
          <Input
            placeholder="제목, 가맹점명 검색..."
            defaultValue={searchParams.get("search") ?? ""}
            onChange={handleSearchChange}
            className="pl-9"
            aria-label="검색어"
          />
        </div>
        <button
          type="button"
          onClick={() => setMobileFiltersOpen((prev) => !prev)}
          className={`sm:hidden flex items-center justify-center size-11 rounded-full border border-input transition-colors ${
            mobileFiltersOpen || hasActiveFilters
              ? "bg-[#007AFF] text-white border-[#007AFF]"
              : "bg-transparent text-[var(--apple-secondary-label)]"
          }`}
          aria-label="필터 열기/닫기"
          aria-expanded={mobileFiltersOpen}
        >
          <SlidersHorizontal className="size-4" />
        </button>
      </div>

      {/* Filter dropdowns - always visible on sm+, toggleable on mobile */}
      <div className={`${mobileFiltersOpen ? "flex" : "hidden"} sm:flex flex-col sm:flex-row gap-3 sm:items-center sm:flex-wrap w-full sm:w-auto`}>
        <select
          aria-label="비용 유형 필터"
          className={selectClassName}
          value={searchParams.get("type") ?? ""}
          onChange={(e) => handleFilterChange("type", e.target.value)}
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          aria-label="상태 필터"
          className={selectClassName}
          value={searchParams.get("status") ?? ""}
          onChange={(e) => handleFilterChange("status", e.target.value)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          aria-label="카테고리 필터"
          className={selectClassName}
          value={searchParams.get("category") ?? ""}
          onChange={(e) => handleFilterChange("category", e.target.value)}
        >
          {ALL_CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            defaultValue={searchParams.get("startDate") ?? defaults.startDate}
            onChange={(e) => handleDateChange("startDate", e.target.value)}
            className="w-full sm:w-auto"
            aria-label="시작일"
          />
          <span className="text-[var(--apple-secondary-label)] text-sm">~</span>
          <Input
            type="date"
            defaultValue={searchParams.get("endDate") ?? defaults.endDate}
            onChange={(e) => handleDateChange("endDate", e.target.value)}
            className="w-full sm:w-auto"
            aria-label="종료일"
          />
        </div>
      </div>

      {isPending && (
        <div className="text-xs text-[#007AFF] animate-pulse font-medium">
          검색 중...
        </div>
      )}
    </div>
  );
}
