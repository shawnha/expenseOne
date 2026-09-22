import {
  addMonths,
  daysInMonth,
  isMonthPart,
  monthKeyOf,
  monthPartDate,
  parseIsoDate,
  parseMonth,
  type DatePrecision,
} from "./diff";

// ---------------------------------------------------------------------------
// 카드를 다른 달로 옮길 때의 날짜 계산 (DB·React 없음, 단위 테스트 대상)
//
// 규칙:
//   - DAY   : 날짜(일)는 그대로 두고 달만 바꾼다. 그 달에 없는 날이면 말일로 자른다(31일 → 30일·28일).
//   - 월 단위 : 초·중순·말을 지킨 채 옮긴 달의 구간 끝날(10일·20일·말일, CHECK cost_plans_month_end 와 같은 규칙).
// 문자열만 다룬다 — diff.ts 와 같은 이유(시간대에 따라 하루가 밀리지 않게).
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * planned_date 를 targetMonth("YYYY-MM") 로 옮긴 날짜. 형식이 틀리면 null.
 * 같은 달이면 정규화만 한 값(월 단위면 구간 끝날)을 돌려준다.
 */
export function moveDateToMonth(date: string, precision: DatePrecision, targetMonth: string): string | null {
  const d = parseIsoDate(date);
  const m = parseMonth(targetMonth);
  if (!d || !m) return null;
  if (isMonthPart(precision)) return monthPartDate(m.year, m.month, precision);
  const day = Math.min(d.day, daysInMonth(m.year, m.month));
  return `${m.year}-${pad2(m.month)}-${pad2(day)}`;
}

/** 한 달 앞·뒤로(delta = ±1 …). 연도 넘김은 addMonths 가 맡는다. */
export function shiftDateByMonths(date: string, precision: DatePrecision, delta: number): string | null {
  if (!parseIsoDate(date)) return null;
  return moveDateToMonth(date, precision, addMonths(monthKeyOf(date), delta));
}
