// ---------------------------------------------------------------------------
// 비용계획 순수 계산 — 날짜·월 묶기·계획 vs 연결 요청 차이 (DB·React 없음, 단위 테스트 대상)
//
// 날짜는 전부 "YYYY-MM-DD" 문자열(Drizzle date mode:"string")로 다룬다. Date 객체를 만들지 않아
// 서버·브라우저 시간대에 따라 하루가 밀리는 일이 없다. "현재 달"만 KST 로 계산한다.
// ---------------------------------------------------------------------------

/**
 * 날짜 단위. DAY = 그날. 나머지 셋은 "월 단위" — 초(1~10일)·중순(11~20일)·말(21일~말일).
 * 저장 날짜는 각 구간의 끝날(10일·20일·말일, CHECK cost_plans_month_end). MONTH 가 '말'인 것은
 * 0024 이전부터 있던 값을 그대로 쓰기 때문이다.
 */
export type DatePrecision = "DAY" | "MONTH_EARLY" | "MONTH_MID" | "MONTH";
export const MONTH_PARTS = ["MONTH_EARLY", "MONTH_MID", "MONTH"] as const;
export type MonthPart = (typeof MONTH_PARTS)[number];

/** 화면 말: "10월 초" · "10월 중순" · "10월 말". '10월 중'은 "10월 안에"로 읽혀 중순이라 쓴다. */
export const MONTH_PART_LABEL: Record<MonthPart, string> = {
  MONTH_EARLY: "초",
  MONTH_MID: "중순",
  MONTH: "말",
};
export type CostPlanStatus = "PLANNED" | "CANCELLED" | "CLOSED";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "YYYY-MM" → {year, month(1~12)}. 형식·범위가 틀리면 null. */
export function parseMonth(key: string): { year: number; month: number } | null {
  const m = MONTH_RE.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
}

/** "YYYY-MM-DD" → {year, month, day}. 달력에 없는 날(2월 30일)은 null. */
export function parseIsoDate(s: string): { year: number; month: number; day: number } | null {
  const m = ISO_DATE_RE.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  // Date.UTC(y, m, 0) = 그 달의 마지막 날 (month 는 1~12 → 다음 달 0일)
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 그 달의 말일 "YYYY-MM-DD". */
export function monthEnd(year: number, month: number): string {
  return `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
}

/** "YYYY-MM" 에 n 달 더하기(음수 가능). */
export function addMonths(key: string, n: number): string {
  const p = parseMonth(key);
  if (!p) throw new RangeError(`잘못된 월: ${key}`);
  const idx = p.year * 12 + (p.month - 1) + n;
  const year = Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  return `${year}-${pad2(month)}`;
}

export function isMonthPart(precision: string | null | undefined): precision is MonthPart {
  return precision === "MONTH_EARLY" || precision === "MONTH_MID" || precision === "MONTH";
}

/** DB 의 text 값 → DatePrecision. 모르는 값은 DAY(날짜 그대로 보이는 쪽이 안전하다). */
export function toDatePrecision(raw: string | null | undefined): DatePrecision {
  return raw === "DAY" || isMonthPart(raw) ? raw : "DAY";
}

/** 날짜(일)가 속한 구간: 1~10일 초, 11~20일 중순, 21일~ 말. */
export function monthPartOfDay(day: number): MonthPart {
  if (day <= 10) return "MONTH_EARLY";
  if (day <= 20) return "MONTH_MID";
  return "MONTH";
}

/** 그 달 그 구간의 저장 날짜(구간 끝날). */
export function monthPartDate(year: number, month: number, part: MonthPart): string {
  if (part === "MONTH") return monthEnd(year, month);
  return `${year}-${pad2(month)}-${part === "MONTH_EARLY" ? "10" : "20"}`;
}

/** "YYYY-MM-DD" → "YYYY-MM". */
export function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

/**
 * 저장 전 정규화(SCHEMA.md 5절 5): 월 단위면 planned_date 는 그 달 구간 끝날(초 10일·중순 20일·말 말일)이어야
 * 한다(CHECK cost_plans_month_end). DAY 면 그대로. 형식이 틀리면 null.
 */
export function normalizePlannedDate(date: string, precision: DatePrecision): string | null {
  const p = parseIsoDate(date);
  if (!p) return null;
  return isMonthPart(precision) ? monthPartDate(p.year, p.month, precision) : date;
}

/** 카드 표시: DAY → "yyyy.mm.dd", 월 단위 → "N월 초" · "N월 중순" · "N월 말". */
export function plannedDateLabel(date: string, precision: DatePrecision): string {
  const p = parseIsoDate(date);
  if (!p) return date;
  if (isMonthPart(precision)) return `${p.month}월 ${MONTH_PART_LABEL[precision]}`;
  return `${p.year}.${pad2(p.month)}.${pad2(p.day)}`;
}

/** 지금이 KST 로 몇 년 몇 월인가 → "YYYY-MM". 서버가 UTC 여도 한국 달을 준다. */
export function currentMonthKST(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}`;
}

export interface MonthRange {
  /** 포함 시작일 "YYYY-MM-01" */
  fromDate: string;
  /** 제외 종료일 "YYYY-MM-01" (from + months) */
  toDate: string;
  /** 각 달의 키 "YYYY-MM", 길이 = months */
  keys: string[];
}

/** 보드 범위: from 달부터 months 달. months 는 1~12 로 자른다. */
export function monthRange(from: string, months: number): MonthRange {
  if (!parseMonth(from)) throw new RangeError(`잘못된 월: ${from}`);
  const n = Math.min(12, Math.max(1, Math.trunc(months)));
  const keys: string[] = [];
  for (let i = 0; i < n; i++) keys.push(addMonths(from, i));
  return { fromDate: `${from}-01`, toDate: `${addMonths(from, n)}-01`, keys };
}

export interface MonthGroupItem {
  plannedDate: string;
  amount: number;
  status: CostPlanStatus | string;
  /** 지급 완료 표시(0025). 없으면 아직 안 나간 것으로 센다. */
  paid?: boolean;
}

export interface MonthGroup<T extends MonthGroupItem> {
  month: string;
  /** PLANNED 항목의 합계만(취소·마감은 제외) */
  total: number;
  /** 이 달의 항목 수(상태 무관) */
  count: number;
  /** total 에서 지급 완료를 뺀 값 = 아직 나갈 돈 */
  unpaidTotal: number;
  /** 지급 완료로 표시된 PLANNED 항목 수 */
  paidCount: number;
  items: T[];
}

/** 항목을 달별로 묶는다. keys 순서대로, 항목이 없는 달도 빈 그룹으로 낸다. 범위 밖 항목은 버린다. */
export function groupByMonth<T extends MonthGroupItem>(items: readonly T[], keys: readonly string[]): MonthGroup<T>[] {
  const map = new Map<string, MonthGroup<T>>();
  for (const k of keys) map.set(k, { month: k, total: 0, count: 0, unpaidTotal: 0, paidCount: 0, items: [] });
  for (const it of items) {
    const g = map.get(monthKeyOf(it.plannedDate));
    if (!g) continue;
    g.items.push(it);
    g.count += 1;
    if (it.status !== "PLANNED") continue;
    g.total += it.amount;
    if (it.paid) g.paidCount += 1;
    else g.unpaidTotal += it.amount;
  }
  return keys.map((k) => map.get(k)!);
}

export interface LinkForDiff {
  id: string;
  /** NULL = 요청이 물리 삭제됨(FK SET NULL). 스냅샷은 남는다. */
  expenseId: string | null;
  snapshotAmount: number;
  /** 요청의 지금 금액(LEFT JOIN). 삭제됐으면 null. */
  currentAmount: number | null;
  /** 요청의 지금 상태. 삭제됐으면 null. */
  currentStatus: string | null;
}

export interface LinkDiffRow<T extends LinkForDiff> {
  link: T;
  /** 요청이 삭제됨 → "삭제된 요청" */
  deleted: boolean;
  /** 연결 뒤 요청 금액이 바뀜 → "제출 후 수정됨" */
  modifiedAfterLink: boolean;
  /** currentAmount − snapshotAmount (삭제면 null) */
  amountDrift: number | null;
}

export interface PlanLinkDiff<T extends LinkForDiff> {
  /** 활성 연결 스냅샷 합계 */
  requestedSum: number;
  linkCount: number;
  /** plan.amount − requestedSum. 양수 = 아직 요청하지 않은 몫, 음수 = 초과 요청 */
  diff: number;
  links: LinkDiffRow<T>[];
}

/**
 * 결정 1-2: 연결된 요청은 **연결 시점 값으로 고정**. 차이는 계획 금액 − 스냅샷 합계.
 * 요청이 나중에 수정되면 카드에 "제출 후 수정됨" 만 표시하고 합계에는 반영하지 않는다.
 */
export function computeLinkDiff<T extends LinkForDiff>(planAmount: number, links: readonly T[]): PlanLinkDiff<T> {
  let requestedSum = 0;
  const rows: LinkDiffRow<T>[] = [];
  for (const link of links) {
    requestedSum += link.snapshotAmount;
    const deleted = link.expenseId == null;
    const modifiedAfterLink = !deleted && link.currentAmount != null && link.currentAmount !== link.snapshotAmount;
    rows.push({
      link,
      deleted,
      modifiedAfterLink,
      amountDrift: deleted || link.currentAmount == null ? null : link.currentAmount - link.snapshotAmount,
    });
  }
  return { requestedSum, linkCount: links.length, diff: planAmount - requestedSum, links: rows };
}
