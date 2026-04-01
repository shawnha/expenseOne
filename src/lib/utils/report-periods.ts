/**
 * Report period utility functions for the expense management reports page.
 * Handles preset date ranges and comparison period calculations.
 */

export type PeriodPreset =
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "last_3_months"
  | "last_6_months"
  | "this_year"
  | "custom";

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

export interface PeriodInfo {
  current: DateRange;
  previous: DateRange;
  label: string; // Korean comparison label e.g. "전월 대비"
}

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "this_month",    label: "이번 달" },
  { value: "last_month",    label: "지난 달" },
  { value: "this_quarter",  label: "이번 분기" },
  { value: "last_3_months", label: "최근 3개월" },
  { value: "last_6_months", label: "최근 6개월" },
  { value: "this_year",     label: "올해" },
  { value: "custom",        label: "직접 입력" },
];

// ─── helpers ────────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Returns a new Date with `months` added (or subtracted if negative). */
function addMonths(d: Date, months: number): Date {
  const result = new Date(d);
  result.setMonth(result.getMonth() + months);
  return result;
}

/** Returns a new Date with `years` added (or subtracted if negative). */
function addYears(d: Date, years: number): Date {
  const result = new Date(d);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/** Last day of the given month. */
function lastDayOfMonth(year: number, month: number): Date {
  return new Date(year, month + 1, 0); // day 0 → last day of previous month
}

/** Quarter index (0-based) for a month (0-based). */
function quarterOfMonth(month: number): number {
  return Math.floor(month / 3);
}

/** First date of a quarter given year + quarter index (0-based). */
function quarterStart(year: number, q: number): Date {
  return new Date(year, q * 3, 1);
}

// ─── main export ─────────────────────────────────────────────────────────────

/**
 * Returns current and previous DateRange for the given preset,
 * plus a Korean comparison label.
 */
export function getPeriodDates(
  preset: PeriodPreset,
  customStart?: string,
  customEnd?: string
): PeriodInfo {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toYMD(today);

  switch (preset) {
    case "this_month": {
      // Current: first day of this month → today
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const current: DateRange = { startDate: toYMD(monthStart), endDate: todayStr };

      // Previous: same day-of-month range in last month
      const prevMonthStart = addMonths(monthStart, -1);
      const prevMonthEnd = addMonths(today, -1);
      // cap prevMonthEnd to last day of that month
      const lastOfPrevMonth = lastDayOfMonth(prevMonthStart.getFullYear(), prevMonthStart.getMonth());
      const cappedPrevEnd = prevMonthEnd > lastOfPrevMonth ? lastOfPrevMonth : prevMonthEnd;
      const previous: DateRange = { startDate: toYMD(prevMonthStart), endDate: toYMD(cappedPrevEnd) };

      return { current, previous, label: "전월 대비" };
    }

    case "last_month": {
      // Current: full last month
      const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastMonthStart = addMonths(firstOfThisMonth, -1);
      const lastMonthEnd = new Date(firstOfThisMonth.getFullYear(), firstOfThisMonth.getMonth(), 0);
      const current: DateRange = { startDate: toYMD(lastMonthStart), endDate: toYMD(lastMonthEnd) };

      // Previous: month before last
      const twoMonthsStart = addMonths(lastMonthStart, -1);
      const twoMonthsEnd = new Date(lastMonthStart.getFullYear(), lastMonthStart.getMonth(), 0);
      const previous: DateRange = { startDate: toYMD(twoMonthsStart), endDate: toYMD(twoMonthsEnd) };

      return { current, previous, label: "전월 대비" };
    }

    case "this_quarter": {
      // Current: start of this quarter → today
      const q = quarterOfMonth(today.getMonth());
      const qStart = quarterStart(today.getFullYear(), q);
      const current: DateRange = { startDate: toYMD(qStart), endDate: todayStr };

      // Previous: previous quarter start → same relative day in that quarter
      const prevQStart = quarterStart(
        q === 0 ? today.getFullYear() - 1 : today.getFullYear(),
        q === 0 ? 3 : q - 1
      );
      // How many days into the current quarter are we?
      const daysIntoCurrentQ = Math.floor((today.getTime() - qStart.getTime()) / 86_400_000);
      const prevQEnd = new Date(prevQStart.getTime() + daysIntoCurrentQ * 86_400_000);
      // Cap to end of that quarter
      const prevQLastMonth = prevQStart.getMonth() + 2; // 0-based last month of that quarter
      const lastOfPrevQ = lastDayOfMonth(
        prevQStart.getFullYear() + Math.floor((prevQStart.getMonth() + 2) / 12),
        prevQLastMonth % 12
      );
      const cappedPrevQEnd = prevQEnd > lastOfPrevQ ? lastOfPrevQ : prevQEnd;
      const previous: DateRange = { startDate: toYMD(prevQStart), endDate: toYMD(cappedPrevQEnd) };

      return { current, previous, label: "전분기 대비" };
    }

    case "last_3_months": {
      // Current: 3 months ago (same day) → today
      const threeMonthsAgoStart = addMonths(today, -3);
      // normalize to first day of that month
      const rangeStart = new Date(threeMonthsAgoStart.getFullYear(), threeMonthsAgoStart.getMonth(), 1);
      const current: DateRange = { startDate: toYMD(rangeStart), endDate: todayStr };

      // Previous: 6 months ago → 3 months ago (day before rangeStart)
      const prevEnd = new Date(rangeStart.getTime() - 86_400_000);
      const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth() - 2, 1);
      const previous: DateRange = { startDate: toYMD(prevStart), endDate: toYMD(prevEnd) };

      return { current, previous, label: "전기간 대비" };
    }

    case "last_6_months": {
      // Current: 6 months ago (first of that month) → today
      const sixMonthsAgo = addMonths(today, -6);
      const rangeStart = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth(), 1);
      const current: DateRange = { startDate: toYMD(rangeStart), endDate: todayStr };

      // Previous: 12 months ago → 6 months ago (day before rangeStart)
      const prevEnd = new Date(rangeStart.getTime() - 86_400_000);
      const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth() - 5, 1);
      const previous: DateRange = { startDate: toYMD(prevStart), endDate: toYMD(prevEnd) };

      return { current, previous, label: "전기간 대비" };
    }

    case "this_year": {
      // Current: Jan 1 this year → today
      const yearStart = new Date(today.getFullYear(), 0, 1);
      const current: DateRange = { startDate: toYMD(yearStart), endDate: todayStr };

      // Previous: Jan 1 last year → same day last year
      const prevYearStart = addYears(yearStart, -1);
      const prevYearEnd = addYears(today, -1);
      // cap to Dec 31
      const lastOfPrevYear = new Date(today.getFullYear() - 1, 11, 31);
      const cappedPrevYearEnd = prevYearEnd > lastOfPrevYear ? lastOfPrevYear : prevYearEnd;
      const previous: DateRange = { startDate: toYMD(prevYearStart), endDate: toYMD(cappedPrevYearEnd) };

      return { current, previous, label: "전년 대비" };
    }

    case "custom": {
      const start = customStart ?? todayStr;
      const end = customEnd ?? todayStr;

      const startDate = parseYMD(start);
      const endDate = parseYMD(end);

      // Length of the custom range in days (inclusive)
      const lengthMs = endDate.getTime() - startDate.getTime();
      const lengthDays = Math.max(0, Math.floor(lengthMs / 86_400_000)) + 1;

      // Previous period: same number of days immediately before
      const prevEnd = new Date(startDate.getTime() - 86_400_000);
      const prevStart = new Date(prevEnd.getTime() - (lengthDays - 1) * 86_400_000);

      const current: DateRange = { startDate: start, endDate: end };
      const previous: DateRange = { startDate: toYMD(prevStart), endDate: toYMD(prevEnd) };

      return { current, previous, label: "직전 기간 대비" };
    }

    default: {
      // Exhaustiveness guard
      const _exhaustive: never = preset;
      throw new Error(`Unknown preset: ${_exhaustive}`);
    }
  }
}

// ─── change percent ───────────────────────────────────────────────────────────

/**
 * Calculates the percentage change from `previous` to `current`.
 * Returns null if both values are 0 (no meaningful comparison).
 * Returns null if previous is 0 and current is non-zero (infinite growth).
 */
export function calcChangePercent(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return null; // avoid division by zero
  return Math.round(((current - previous) / Math.abs(previous)) * 100 * 10) / 10;
}
