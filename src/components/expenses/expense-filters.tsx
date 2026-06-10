"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Search, SlidersHorizontal, CalendarIcon } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, subDays, startOfYear, endOfYear } from "date-fns";
import { ko } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_OPTIONS } from "@/lib/validations/expense-form";
import { cn } from "@/lib/utils";

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
  { value: "__all__", label: "전체 유형" },
  { value: "CORPORATE_CARD", label: "법카사용" },
  { value: "DEPOSIT_REQUEST", label: "입금요청" },
  { value: "REFUND", label: "반품" },
];

const STATUS_OPTIONS = [
  { value: "__all__", label: "전체 상태" },
  { value: "SUBMITTED", label: "제출" },
  { value: "APPROVED", label: "승인" },
  { value: "REJECTED", label: "반려" },
  { value: "CANCELLED", label: "취소" },
];

const ALL_CATEGORY_OPTIONS = [
  { value: "__all__", label: "전체 카테고리" },
  ...CATEGORY_OPTIONS,
];

const AUTO_CLASSIFIED_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "auto", label: "자동분류" },
  { value: "manual", label: "수동제출" },
];

interface ExpenseFiltersProps {
  showAdminFilters?: boolean;
}

function parseISODate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00`);
  return isNaN(d.getTime()) ? undefined : d;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ExpenseFilters({ showAdminFilters = false }: ExpenseFiltersProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const defaults = useMemo(() => getDefaultDateRange(), []);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
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
      const actual = value === "__all__" ? "" : value;
      startTransition(() => {
        const qs = createQueryString({ [key]: actual || null });
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

  const handleDateRangeChange = useCallback(
    (range: { from?: Date; to?: Date } | undefined) => {
      const from = range?.from ? toISODate(range.from) : null;
      const to = range?.to ? toISODate(range.to) : null;
      startTransition(() => {
        const qs = createQueryString({ startDate: from, endDate: to });
        router.push(`${pathname}${qs ? `?${qs}` : ""}`);
      });
    },
    [createQueryString, pathname, router]
  );

  const applyPreset = useCallback(
    (preset: "thisMonth" | "lastMonth" | "last7" | "last30" | "thisYear") => {
      const now = new Date();
      let from: Date;
      let to: Date;
      switch (preset) {
        case "thisMonth":
          from = startOfMonth(now);
          to = endOfMonth(now);
          break;
        case "lastMonth": {
          const lm = subMonths(now, 1);
          from = startOfMonth(lm);
          to = endOfMonth(lm);
          break;
        }
        case "last7":
          from = subDays(now, 6);
          to = now;
          break;
        case "last30":
          from = subDays(now, 29);
          to = now;
          break;
        case "thisYear":
          from = startOfYear(now);
          to = endOfYear(now);
          break;
      }
      handleDateRangeChange({ from, to });
      setDateOpen(false);
    },
    [handleDateRangeChange]
  );

  const startDateParam = searchParams.get("startDate") ?? defaults.startDate;
  const endDateParam = searchParams.get("endDate") ?? defaults.endDate;
  const selectedRange: DateRange | undefined = useMemo(() => {
    const from = parseISODate(startDateParam);
    const to = parseISODate(endDateParam);
    if (!from && !to) return undefined;
    return { from, to };
  }, [startDateParam, endDateParam]);

  const dateLabel = useMemo(() => {
    const from = parseISODate(startDateParam);
    const to = parseISODate(endDateParam);
    if (!from && !to) return "기간 선택";
    const fromStr = from ? format(from, "yy.MM.dd", { locale: ko }) : "—";
    const toStr = to ? format(to, "yy.MM.dd", { locale: ko }) : "—";
    if (from && to && fromStr === toStr) return fromStr;
    return `${fromStr} ~ ${toStr}`;
  }, [startDateParam, endDateParam]);

  const freelancerActive = searchParams.get("freelancer") === "true";

  const handleFreelancerToggle = useCallback(() => {
    startTransition(() => {
      const qs = createQueryString({ freelancer: freelancerActive ? null : "true" });
      router.push(`${pathname}${qs ? `?${qs}` : ""}`);
    });
  }, [createQueryString, freelancerActive, pathname, router]);

  const hasActiveFilters = !!(
    searchParams.get("type") ||
    searchParams.get("status") ||
    searchParams.get("category") ||
    (searchParams.get("autoClassified") && searchParams.get("autoClassified") !== "all") ||
    freelancerActive
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
            placeholder="제목, 가맹점, 제출자, 예금주, 카드번호 검색..."
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
              ? "bg-[var(--apple-blue)] text-white border-[var(--apple-blue)]"
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
        <Select
          value={searchParams.get("type") ?? "__all__"}
          onValueChange={(v) => v && handleFilterChange("type", v)}
        >
          <SelectTrigger className="h-11 sm:h-8 w-full sm:w-auto rounded-xl glass-input" aria-label="비용 유형 필터">
            <SelectValue>
              {TYPE_OPTIONS.find((o) => o.value === (searchParams.get("type") || "__all__"))?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("status") ?? "__all__"}
          onValueChange={(v) => v && handleFilterChange("status", v)}
        >
          <SelectTrigger className="h-11 sm:h-8 w-full sm:w-auto rounded-xl glass-input" aria-label="상태 필터">
            <SelectValue>
              {STATUS_OPTIONS.find((o) => o.value === (searchParams.get("status") || "__all__"))?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("category") ?? "__all__"}
          onValueChange={(v) => v && handleFilterChange("category", v)}
        >
          <SelectTrigger className="h-11 sm:h-8 w-full sm:w-auto rounded-xl glass-input" aria-label="카테고리 필터">
            <SelectValue>
              {ALL_CATEGORY_OPTIONS.find((o) => o.value === (searchParams.get("category") || "__all__"))?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ALL_CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={handleFreelancerToggle}
          aria-pressed={freelancerActive}
          aria-label="프리랜서 원천징수 필터"
          className={cn(
            "h-11 sm:h-8 w-full sm:w-auto rounded-full px-3.5 inline-flex items-center justify-center gap-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,122,255,0.4)]",
            freelancerActive
              ? "bg-[var(--apple-blue)] text-white border border-[var(--apple-blue)]"
              : "glass-input text-[var(--apple-label)] hover:bg-white",
          )}
        >
          <span className="tabular-nums">프리랜서</span>
          {freelancerActive && <span aria-hidden className="text-xs leading-none">×</span>}
        </button>

        {showAdminFilters && (
          <Select
            value={searchParams.get("autoClassified") ?? "all"}
            onValueChange={(v) => v && handleFilterChange("autoClassified", v === "all" ? "" : v)}
          >
            <SelectTrigger className="h-11 sm:h-8 w-full sm:w-auto rounded-xl glass-input" aria-label="자동분류 필터">
              <SelectValue>
                {AUTO_CLASSIFIED_OPTIONS.find(
                  (o) => o.value === (searchParams.get("autoClassified") || "all"),
                )?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {AUTO_CLASSIFIED_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Popover open={dateOpen} onOpenChange={setDateOpen}>
          <PopoverTrigger
            className={cn(
              "h-11 sm:h-8 w-full sm:w-auto rounded-xl glass-input px-3 inline-flex items-center justify-start gap-2 text-sm",
              "text-[var(--apple-label)] hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,122,255,0.4)]",
            )}
            aria-label="기간 선택"
          >
            <CalendarIcon className="size-4 text-[var(--apple-secondary-label)] shrink-0" />
            <span className="tabular-nums truncate">{dateLabel}</span>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-0 rounded-2xl glass-strong border-0 overflow-hidden"
            align="end"
            sideOffset={8}
          >
            <div className="flex flex-col sm:flex-row">
              <div className="flex sm:flex-col gap-1 p-2 sm:p-2.5 sm:border-r sm:border-[var(--apple-separator)] overflow-x-auto sm:overflow-visible sm:min-w-[112px]">
                {[
                  { key: "thisMonth", label: "이번 달" },
                  { key: "lastMonth", label: "지난 달" },
                  { key: "last7", label: "최근 7일" },
                  { key: "last30", label: "최근 30일" },
                  { key: "thisYear", label: "올해" },
                ].map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyPreset(preset.key as Parameters<typeof applyPreset>[0])}
                    className="shrink-0 text-left text-sm rounded-lg px-2.5 py-1.5 text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.06)] transition-colors whitespace-nowrap"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="p-2 sm:p-2.5">
                <Calendar
                  mode="range"
                  selected={selectedRange}
                  onSelect={(range) => handleDateRangeChange(range)}
                  numberOfMonths={1}
                  locale={ko}
                  defaultMonth={selectedRange?.from ?? new Date()}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {isPending && (
        <div className="text-xs text-[var(--apple-blue)] animate-pulse font-medium">
          검색 중...
        </div>
      )}
    </div>
  );
}
