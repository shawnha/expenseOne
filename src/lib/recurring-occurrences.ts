// ---------------------------------------------------------------------------
// 반복 지급의 회차 계산 — 비용계획에 미리 깔 날짜, "사람이 안 건드린 계획" 판정, 반복을 고쳤을 때 할 일.
//
// 순수 함수만 둔다(DB·시간대 모름). 날짜는 "yyyy-mm-dd" 문자열. 서비스(recurring-plan.service)가 이
// 결과대로 쓰기만 한다 — 경우가 많아 DB 없이 테스트하려고 여기 모았다.
//
// 규칙
// - 회차 하나 = recurring_occurrences 한 줄, (반복, 날짜) UNIQUE. 같은 날짜로 두 번 깔지 않는다.
// - 비용계획은 오늘부터 PLAN_HORIZON_MONTHS 달 뒤 말일까지 미리 깐다. 매일 cron 이 창을 민다.
// - 사람이 손댄 계획(수정·지급 완료·연결·ERP 반영 표시·취소)은 반복이 다시 건드리지 않는다. 그 계획은
//   그때부터 사람 것이다. 반복을 고치거나 멈춰도 그대로 둔다.
// - 이미 예정일 처리(run_at)가 된 회차는 지난 일이라 건드리지 않는다.
// ---------------------------------------------------------------------------

import { firstRunOnOrAfter, lastDayOfMonth, nextRunAfter, type Schedule } from "./recurring-schedule";
import { normalizePlannedDate, type DatePrecision } from "./plans/diff";

/** 이번 달 + 앞으로 몇 달 치를 비용계획에 깔지. 이번 달 포함 4달. */
export const PLAN_HORIZON_MONTHS = 3;

/** 한 번에 만들 회차 상한(주마다 반복 + 긴 창 같은 경우의 폭주 방지). */
export const MAX_OCCURRENCES_PER_PASS = 24;

export function monthStartOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** today 가 속한 달에서 months 달 뒤의 말일. */
export function monthEndAfter(today: string, months: number): string {
  const [y, m] = today.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  return `${ty}-${String(tm).padStart(2, "0")}-${String(lastDayOfMonth(ty, tm)).padStart(2, "0")}`;
}

/**
 * 기준 회차(anchor)에서 nextRunAfter 로 이어 가며 [from, to] 안에 드는 예정일들. 양 끝 포함.
 *
 * **반드시 기준점에서 이어 간다.** from 에서 새로 세면(firstRunOnOrAfter(from)) 격월·분기·격주 반복은 창 시작일이
 * 기준점이 돼 날마다 다른 달이 나온다(오늘 10-18 이면 10·12월, 11-10 이면 11·1월) — 맞는 계획을 지웠다 다시 깔고,
 * cron 의 처리 날짜(nextRunDate 를 nextRunAfter 로 이어 감)와도 어긋난다.
 * anchor 는 그 자체가 회차다(starts_on, 옛 행은 next_run_date).
 */
export function occurrenceDatesBetween(
  schedule: Schedule,
  anchor: string,
  from: string,
  to: string,
  cap: number = MAX_OCCURRENCES_PER_PASS,
): string[] {
  const out: string[] = [];
  if (from > to) return out;
  let d = firstOnOrAfterFromAnchor(schedule, anchor, from);
  while (d <= to && out.length < cap) {
    out.push(d);
    d = nextRunAfter(schedule, d);
  }
  return out;
}

/** 기준 회차에서 이어 가며 from 이상인 첫 회차. */
export function firstOnOrAfterFromAnchor(schedule: Schedule, anchor: string, from: string): string {
  let d = anchor;
  // 매주 반복도 10년이면 520번 — 그 이상은 기준점이 잘못된 것이다.
  for (let i = 0; d < from && i < 1000; i++) d = nextRunAfter(schedule, d);
  return d;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

function shiftMonthStart(iso: string, months: number): string {
  const [y, m] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

/**
 * 주기(며칠·간격·요일)를 바꿨을 때 새 기준 회차. 옛 시작일은 새 주기의 회차가 아니라 기준점으로 못 쓴다.
 * 이 날 이후 첫 회차부터 다시 센다:
 * - 오늘(지난 날로 거슬러 가지 않는다)
 * - 옛 시작일이 든 달의 1일(입금요청 폼의 「매달 반복」은 이번 달 건을 방금 올려 다음 달부터 시작한다 — 그 뜻을 지킨다)
 * - 마지막으로 처리한 회차 다음 주기(이번 달 회차를 이미 처리했는데 날짜를 25일로 옮기면 같은 달에 또 나가면 안 된다)
 */
export function restartAnchor(args: {
  schedule: Schedule;
  today: string;
  previousStartsOn: string | null;
  lastRunDate: string | null;
}): string {
  const { schedule, today } = args;
  const interval = Math.max(1, schedule.intervalCount || 1);
  let floor = today;
  if (args.previousStartsOn) {
    const ms = monthStartOf(args.previousStartsOn);
    if (ms > floor) floor = ms;
  }
  if (args.lastRunDate) {
    const afterLast =
      schedule.frequency === "WEEKLY"
        ? addDaysIso(args.lastRunDate, 7 * (interval - 1) + 1)
        : schedule.frequency === "MONTHLY"
          ? shiftMonthStart(args.lastRunDate, interval)
          : shiftMonthStart(args.lastRunDate, 1); // 매년: 그 달만 넘기면 firstRunOnOrAfter 가 다음 해로 간다
    if (afterLast > floor) floor = afterLast;
  }
  return firstMatchingOnOrAfter(schedule, floor);
}

/**
 * from 이후(포함) 그 주기의 날짜·요일에 맞는 첫날 — **기준 회차를 새로 잡을 때** 쓴다.
 * firstRunOnOrAfter 는 간격이 2 이상이면 "이번 후보가 지났으면 +간격"으로 계산해 첫 회차를 한 주기 건너뛴다
 * (격주 월요일을 10-20 에 만들면 10-26 이 아니라 11-02). 기준점은 그 자체가 회차라 간격 1 로 찾는다.
 */
export function firstMatchingOnOrAfter(schedule: Schedule, from: string): string {
  return firstRunOnOrAfter({ ...schedule, intervalCount: 1 }, from);
}

/**
 * 비용계획에 깔 날짜 범위. 없으면 null.
 * - 시작 = max(starts_on, floor). floor 는 기본 오늘 — 지난 날짜는 새로 깔지 않는다. 날짜를 바꾸거나 비용계획을
 *   늦게 켰다고 이미 지난 날(이번 달 앞쪽 포함)에 계획이 뒤늦게 생기면 아무도 처리하지 않을 카드가 남고 지난 합계가 바뀐다.
 *   반복을 처음 만들 때만 floor 로 starts_on 을 넘겨 사용자가 고른 첫 날짜(지난 날이어도)를 깐다 — 계획 화면에서
 *   이번 달 5일 건을 오늘(18일) 등록하는 경우.
 * - 끝 = min(ends_on, 창 끝).
 */
export function planWindow(
  t: { startsOn: string | null; endsOn: string | null },
  today: string,
  floor: string = today,
): { from: string; to: string } | null {
  const start = t.startsOn ?? floor;
  const from = start > floor ? start : floor;
  const horizon = monthEndAfter(today, PLAN_HORIZON_MONTHS);
  const to = t.endsOn != null && t.endsOn < horizon ? t.endsOn : horizon;
  return from <= to ? { from, to } : null;
}

/** 회차 날짜 → 계획 날짜. 월 단위면 그 달 구간 끝날(초 10일·중순 20일·말 말일)로 맞춘다(CHECK cost_plans_month_end). */
export function planDateFor(occurrenceDate: string, precision: DatePrecision): string {
  return normalizePlannedDate(occurrenceDate, precision) ?? occurrenceDate;
}

// ---------------------------------------------------------------------------
// 사람이 안 건드린 계획
// ---------------------------------------------------------------------------

export interface OccurrencePlanState {
  occurrenceDate: string;
  runAt: string | null;
  planId: string | null;
  /** 우리가 마지막으로 쓴 version. */
  planVersion: number | null;
  /** 지금 cost_plans.version. */
  version: number | null;
  status: string | null;
  deletedAt: string | null;
  paidAt: string | null;
  erpAppliedAt: string | null;
  /** 해제 안 된 입금요청 연결 수. */
  activeLinks: number;
}

/**
 * 반복이 고쳐도 되는 계획인가. 하나라도 사람 손이 닿았으면 false.
 * 날짜가 오늘 이전이면 false — 지난 회차는 기록이다.
 */
export function isUntouchedPlan(o: OccurrencePlanState, today: string): boolean {
  return (
    o.planId != null &&
    o.runAt == null &&
    o.occurrenceDate >= today &&
    o.deletedAt == null &&
    o.status === "PLANNED" &&
    o.planVersion != null &&
    o.version === o.planVersion &&
    o.paidAt == null &&
    o.erpAppliedAt == null &&
    o.activeLinks === 0
  );
}

// ---------------------------------------------------------------------------
// 반복을 만들거나 고친 뒤 비용계획을 맞추는 계획
// ---------------------------------------------------------------------------

export interface DesiredPlanFields {
  companyId: string;
  projectId: string;
  brandId: string | null;
  title: string;
  amount: number;
  datePrecision: DatePrecision;
  vendorName: string | null;
}

export interface ExistingOccurrence extends OccurrencePlanState {
  occurrenceId: string;
  /** 계획이 있으면 그 계획의 지금 값. */
  plan: (Omit<DesiredPlanFields, "datePrecision"> & { datePrecision: DatePrecision; plannedDate: string }) | null;
}

export interface PlanFieldChanges {
  projectId?: string;
  brandId?: string | null;
  title?: string;
  amount?: number;
  plannedDate?: string;
  datePrecision?: DatePrecision;
  vendorName?: string | null;
}

export interface OccurrenceSyncPlan {
  /** 새로 깔 날짜. 회차 줄이 이미 있으면(계획 없이) 그 줄에 계획을 붙인다. */
  create: string[];
  /** 안 건드린 계획을 반복 값으로 고친다. */
  update: Array<{ occurrenceId: string; planId: string; expectedVersion: number; changes: PlanFieldChanges }>;
  /** 안 건드린 계획을 지운다(소프트) + 회차 줄도 지운다. */
  remove: Array<{ occurrenceId: string; planId: string }>;
}

/**
 * desired = null 이면 비용계획을 끈 것(프로젝트 해제·일시중지·삭제). dates = planWindow 안에서 깔아야 할 날짜.
 * 손댄 계획·이미 처리된 회차는 어느 목록에도 넣지 않는다(그대로 둔다).
 */
export function planOccurrenceSync(args: {
  desired: DesiredPlanFields | null;
  dates: string[];
  existing: ExistingOccurrence[];
  today: string;
}): OccurrenceSyncPlan {
  const { desired, today } = args;
  const want = new Set(desired ? args.dates : []);
  const byDate = new Map(args.existing.map((o) => [o.occurrenceDate, o]));
  const result: OccurrenceSyncPlan = { create: [], update: [], remove: [] };

  for (const o of args.existing) {
    if (!isUntouchedPlan(o, today) || !o.plan) continue;
    const keep = desired != null && want.has(o.occurrenceDate) && o.plan.companyId === desired.companyId;
    if (!keep) {
      result.remove.push({ occurrenceId: o.occurrenceId, planId: o.planId! });
      continue;
    }
    const changes = diffPlanFields(o.plan, desired!, o.occurrenceDate);
    if (Object.keys(changes).length > 0) {
      result.update.push({ occurrenceId: o.occurrenceId, planId: o.planId!, expectedVersion: o.version!, changes });
    }
  }

  for (const d of want) {
    const o = byDate.get(d);
    if (!o) {
      result.create.push(d);
    } else if (o.planId == null && o.runAt == null) {
      // 계획 없이 회차만 있던 날(비용계획을 나중에 켬). 이미 처리된 회차는 지난 일이라 안 깐다.
      result.create.push(d);
    } else if (o.planId != null && result.remove.some((r) => r.occurrenceId === o.occurrenceId)) {
      // 법인이 바뀌어 지운 계획 — 새 법인으로 다시 깐다.
      result.create.push(d);
    }
  }
  result.create.sort();
  return result;
}

function diffPlanFields(
  cur: NonNullable<ExistingOccurrence["plan"]>,
  want: DesiredPlanFields,
  occurrenceDate: string,
): PlanFieldChanges {
  const c: PlanFieldChanges = {};
  if (cur.projectId !== want.projectId) c.projectId = want.projectId;
  if ((cur.brandId ?? null) !== (want.brandId ?? null)) c.brandId = want.brandId ?? null;
  if (cur.title !== want.title) c.title = want.title;
  if (cur.amount !== want.amount) c.amount = want.amount;
  if ((cur.vendorName ?? null) !== (want.vendorName ?? null)) c.vendorName = want.vendorName ?? null;
  const plannedDate = planDateFor(occurrenceDate, want.datePrecision);
  if (cur.plannedDate !== plannedDate) c.plannedDate = plannedDate;
  if (cur.datePrecision !== want.datePrecision) c.datePrecision = want.datePrecision;
  return c;
}

// ---------------------------------------------------------------------------
// 예정일 처리 방식
// ---------------------------------------------------------------------------

export type RequestMode = "AUTO" | "REMIND" | "NONE";

export const REQUEST_MODE_LABEL: Record<RequestMode, string> = {
  AUTO: "같은 금액으로 자동 제출",
  REMIND: "금액 확인 알림",
  NONE: "비용계획에만 표시",
};

export function toRequestMode(raw: string | null | undefined): RequestMode {
  return raw === "REMIND" || raw === "NONE" ? raw : "AUTO";
}

/**
 * 반복 설정 값이 함께 성립하는지(서버·폼 같은 문장). DB CHECK 와 같은 규칙인데, CHECK 에 걸리면
 * 사용자는 무엇이 빠졌는지 모른다. 통과하면 null.
 */
export function recurringConfigError(t: {
  requestMode: RequestMode;
  currency: string;
  category: string | null | undefined;
  bankName: string | null | undefined;
  accountHolder: string | null | undefined;
  accountNumber: string | null | undefined;
  planProjectId: string | null | undefined;
  planBrandId: string | null | undefined;
  startsOn: string | null | undefined;
  endsOn: string | null | undefined;
}): string | null {
  if (t.requestMode === "AUTO") {
    if (!t.category?.trim()) return "자동 제출하려면 카테고리가 필요합니다.";
    if (!t.bankName?.trim() || !t.accountHolder?.trim() || !t.accountNumber?.trim()) {
      return "자동 제출하려면 은행·예금주·계좌번호가 필요합니다.";
    }
  }
  if (t.requestMode === "NONE" && !t.planProjectId) {
    return "입금요청을 만들지 않으면 비용계획 프로젝트를 골라야 합니다.";
  }
  if (t.planBrandId && !t.planProjectId) return "분류를 고르려면 프로젝트를 먼저 골라주세요.";
  if (t.planProjectId && t.currency !== "KRW") return "비용계획은 원화 건만 됩니다.";
  if (t.startsOn && t.endsOn && t.endsOn < t.startsOn) return "끝나는 날이 시작일보다 앞입니다.";
  return null;
}
