// ---------------------------------------------------------------------------
// 반복 지급의 회차 계산 — 비용계획에 미리 깔 날짜, "사람이 안 건드린 계획" 판정, 반복을 고쳤을 때 할 일.
//
// 순수 함수만 둔다(DB·시간대 모름). 날짜는 "yyyy-mm-dd" 문자열. 서비스(recurring-plan.service)가 이
// 결과대로 쓰기만 한다 — 경우가 많아 DB 없이 테스트하려고 여기 모았다.
//
// 규칙
// - 회차 하나 = recurring_occurrences 한 줄, (반복, 날짜) UNIQUE. 같은 날짜로 두 번 깔지 않는다.
// - 비용계획은 이번 달 1일부터 PLAN_HORIZON_MONTHS 달 뒤 말일까지 미리 깐다. 매일 cron 이 창을 민다.
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

/** [from, to] 안의 예정일들. 양 끝 포함. */
export function occurrenceDatesBetween(
  schedule: Schedule,
  from: string,
  to: string,
  cap: number = MAX_OCCURRENCES_PER_PASS,
): string[] {
  const out: string[] = [];
  if (from > to) return out;
  let d = firstRunOnOrAfter(schedule, from);
  while (d <= to && out.length < cap) {
    out.push(d);
    d = nextRunAfter(schedule, d);
  }
  return out;
}

/**
 * 비용계획에 깔 날짜 범위. 없으면 null.
 * - 시작 = max(starts_on, floor). floor 는 기본 이번 달 1일 — 지난달 이전은 새로 깔지 않는다
 *   (반복을 늦게 켰다고 지난 달 계획이 뒤늦게 생기면 이미 끝난 달 합계가 바뀐다).
 *   반복을 처음 만들 때는 floor 로 starts_on 을 넘겨 사용자가 고른 첫 날짜(이번 달 앞쪽이어도)를 깐다.
 * - 끝 = min(ends_on, 창 끝).
 */
export function planWindow(
  t: { startsOn: string | null; endsOn: string | null },
  today: string,
  floor: string = monthStartOf(today),
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
