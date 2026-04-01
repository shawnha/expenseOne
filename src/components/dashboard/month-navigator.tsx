"use client";

import { useState, useRef, useEffect } from "react";
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

function getYearFromKey(key: string): number {
  return parseInt(key.split("-")[0]);
}

function getMonthFromKey(key: string): number {
  return parseInt(key.split("-")[1]);
}

/**
 * Reusable month navigator with arrow buttons and click-to-open month picker.
 *
 * Two modes:
 * - URL mode (default): reads/writes `?month=` search param, triggers server re-render
 * - Controlled mode: pass `value` and `onChange` props for client-side state
 */
export function MonthNavigator({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (month: string) => void;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL mode or controlled mode
  const isControlled = value !== undefined && onChange !== undefined;
  const month = isControlled ? value : (searchParams.get("month") ?? getCurrentMonthKey());
  const currentMonthKey = getCurrentMonthKey();
  const isCurrentMonth = month === currentMonthKey;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(getYearFromKey(month));
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

  // Sync picker year when month changes
  useEffect(() => {
    setPickerYear(getYearFromKey(month));
  }, [month]);

  function navigate(newMonth: string) {
    setPickerOpen(false);
    if (isControlled) {
      onChange(newMonth);
    } else {
      const params = new URLSearchParams(searchParams.toString());
      if (newMonth === currentMonthKey) {
        params.delete("month");
      } else {
        params.set("month", newMonth);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    }
  }

  const currentYear = new Date().getFullYear();
  const currentMonthNum = new Date().getMonth() + 1;
  const selectedMonthNum = getMonthFromKey(month);
  const selectedYear = getYearFromKey(month);

  const MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

  return (
    <div className="relative flex items-center gap-1" role="group" aria-label="월 선택">
      <button
        type="button"
        onClick={() => navigate(shiftMonth(month, -1))}
        className="size-8 flex items-center justify-center rounded-full text-[var(--apple-secondary-label)] hover:bg-[var(--apple-fill)] transition-colors apple-press"
        aria-label="이전 달"
      >
        <ChevronLeft className="size-4" />
      </button>

      {/* Month pill — click to open picker */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setPickerYear(getYearFromKey(month));
          setPickerOpen(!pickerOpen);
        }}
        className="px-3 py-1 rounded-full bg-[var(--apple-blue)] text-white text-[13px] font-semibold min-w-[100px] text-center transition-colors hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] apple-press"
      >
        {formatMonthLabel(month)}
      </button>

      <button
        type="button"
        onClick={() => !isCurrentMonth && navigate(shiftMonth(month, 1))}
        disabled={isCurrentMonth}
        className="size-8 flex items-center justify-center rounded-full text-[var(--apple-secondary-label)] hover:bg-[var(--apple-fill)] transition-colors apple-press disabled:opacity-30 disabled:pointer-events-none"
        aria-label="다음 달"
      >
        <ChevronRight className="size-4" />
      </button>

      {/* Month picker popover */}
      {pickerOpen && (
        <div
          ref={popoverRef}
          className="absolute top-full mt-2 right-0 z-50 w-[240px] glass rounded-2xl border border-[var(--glass-border)] shadow-lg p-3 animate-fade-up"
        >
          {/* Year navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setPickerYear((y) => y - 1)}
              className="size-7 flex items-center justify-center rounded-full text-[var(--apple-secondary-label)] hover:bg-[var(--apple-fill)] transition-colors"
              aria-label="이전 년도"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="text-[14px] font-semibold text-[var(--apple-label)]">
              {pickerYear}년
            </span>
            <button
              type="button"
              onClick={() => pickerYear < currentYear && setPickerYear((y) => y + 1)}
              disabled={pickerYear >= currentYear}
              className="size-7 flex items-center justify-center rounded-full text-[var(--apple-secondary-label)] hover:bg-[var(--apple-fill)] transition-colors disabled:opacity-30 disabled:pointer-events-none"
              aria-label="다음 년도"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-4 gap-1.5">
            {MONTHS.map((label, idx) => {
              const m = idx + 1;
              const key = `${pickerYear}-${String(m).padStart(2, "0")}`;
              const isFuture = pickerYear > currentYear || (pickerYear === currentYear && m > currentMonthNum);
              const isSelected = pickerYear === selectedYear && m === selectedMonthNum;

              return (
                <button
                  key={m}
                  type="button"
                  disabled={isFuture}
                  onClick={() => navigate(key)}
                  className={`py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                    isSelected
                      ? "bg-[var(--apple-blue)] text-white"
                      : isFuture
                        ? "text-[var(--apple-tertiary-label)] cursor-not-allowed"
                        : "text-[var(--apple-label)] hover:bg-[var(--apple-fill)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
