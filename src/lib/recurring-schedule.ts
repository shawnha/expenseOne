// ---------------------------------------------------------------------------
// 반복 입금요청의 다음 예정일 계산
//
// 순수 함수만 둔다 — DB도 시간대도 모른다. 날짜는 전부 "yyyy-mm-dd" 문자열로
// 주고받는다. Date 객체를 돌리면 로컬 시간대에 따라 하루가 밀리는 사고가
// 나는데, 이 계산은 KST 기준 날짜만 다루면 되므로 문자열이 안전하다.
// ---------------------------------------------------------------------------

export type Frequency = "WEEKLY" | "MONTHLY" | "YEARLY";

export interface Schedule {
  frequency: Frequency;
  /** N주기마다. 격월 = MONTHLY 2, 분기 = MONTHLY 3. */
  intervalCount: number;
  /** MONTHLY/YEARLY: 1~31 */
  dayOfMonth?: number | null;
  /** YEARLY: 1~12 */
  monthOfYear?: number | null;
  /** WEEKLY: 0(일)~6(토) */
  weekday?: number | null;
}

/** 그 달의 마지막 날. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseISO(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

/** 요일(0=일). UTC로 계산해 시간대 영향을 받지 않게 한다. */
export function weekdayOf(iso: string): number {
  const { y, m, d } = parseISO(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(iso: string, days: number): string {
  const { y, m, d } = parseISO(iso);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/**
 * y년 m월의 dayOfMonth. **그 달에 없는 날이면 말일로 대체한다.**
 * 매달 31일로 잡으면 2월엔 28/29일, 4월엔 30일이 된다 — 날짜를 건너뛰면
 * 그 달 지급이 통째로 누락되므로 말일로 당긴다.
 */
function clampDay(y: number, m: number, dayOfMonth: number): string {
  return toISO(y, m, Math.min(dayOfMonth, lastDayOfMonth(y, m)));
}

/** 개월 수를 더한 (year, month). */
function shiftMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const total = y * 12 + (m - 1) + delta;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

/**
 * `after`(포함하지 않음) **다음에 오는** 예정일.
 *
 * 경계 규칙: 반환값은 항상 `after`보다 뒤다. 같은 날을 돌려주면 cron이 같은 날
 * 두 번 돌 때 중복 생성되고, 생성 직후 nextRunDate를 밀 수도 없다.
 */
export function nextRunAfter(schedule: Schedule, after: string): string {
  const interval = Math.max(1, schedule.intervalCount || 1);

  if (schedule.frequency === "WEEKLY") {
    const target = schedule.weekday ?? 0;
    const cur = weekdayOf(after);
    // 다음 해당 요일까지 남은 일수(오늘이면 7일 뒤 = 다음 주).
    let delta = (target - cur + 7) % 7;
    if (delta === 0) delta = 7;
    // 2주 간격 등은 주 단위로 더 민다.
    return addDays(after, delta + (interval - 1) * 7);
  }

  const { y, m } = parseISO(after);
  const day = schedule.dayOfMonth ?? 1;

  if (schedule.frequency === "MONTHLY") {
    // 이번 달 후보가 after보다 뒤면 그걸 쓰고, 아니면 interval만큼 민다.
    const candidate = clampDay(y, m, day);
    if (candidate > after) return candidate;
    const nx = shiftMonths(y, m, interval);
    return clampDay(nx.y, nx.m, day);
  }

  // YEARLY
  const month = schedule.monthOfYear ?? 1;
  const thisYear = clampDay(y, month, day);
  if (thisYear > after) return thisYear;
  return clampDay(y + interval, month, day);
}

/**
 * 설정 화면에서 쓰는 첫 예정일. 오늘 조건에 맞으면 **오늘**부터 시작한다.
 * (nextRunAfter는 항상 다음 날짜를 주므로 시작일 계산엔 쓸 수 없다.)
 */
export function firstRunOnOrAfter(schedule: Schedule, from: string): string {
  const prev = addDays(from, -1);
  return nextRunAfter(schedule, prev);
}

/** 사람이 읽는 주기 설명. 목록·알림에서 같은 문구를 쓰기 위해 여기 둔다. */
export function describeSchedule(schedule: Schedule): string {
  const n = Math.max(1, schedule.intervalCount || 1);
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  switch (schedule.frequency) {
    case "WEEKLY":
      return n === 1
        ? `매주 ${WD[schedule.weekday ?? 0]}요일`
        : `${n}주마다 ${WD[schedule.weekday ?? 0]}요일`;
    case "MONTHLY":
      return n === 1
        ? `매달 ${schedule.dayOfMonth}일`
        : `${n}개월마다 ${schedule.dayOfMonth}일`;
    case "YEARLY":
      return n === 1
        ? `매년 ${schedule.monthOfYear}월 ${schedule.dayOfMonth}일`
        : `${n}년마다 ${schedule.monthOfYear}월 ${schedule.dayOfMonth}일`;
  }
}

/** 납입 기일 = 생성일 + offset. offset이 없으면 기일 없음. */
export function dueDateFor(runDate: string, offsetDays: number | null | undefined): string | null {
  if (offsetDays == null) return null;
  return addDays(runDate, offsetDays);
}
