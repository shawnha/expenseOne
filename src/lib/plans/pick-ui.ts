/**
 * 비용(입금요청·법카) 폼이 계획을 고를 때 쓰는 순수 함수 모음.
 * 이 파일은 폼 묶음에 들어가므로 계획 서비스·DB 모듈을 import 하지 않는다. ./diff 는 import 없는 순수 모듈이라 괜찮다.
 */

import { isMonthPart, MONTH_PART_LABEL } from "./diff";

/** 폼이 필요로 하는 계획 정보 — PlanPick 의 부분집합이라 구조적으로 호환된다. */
export interface PickLike {
  title: string;
  plannedDate: string;
  datePrecision: string;
  companyId: string;
}

/**
 * "2026-10-23" → "2026.10.23". 월 단위 계획은 구간까지 적는다: "2026.10 초" · "2026.10 중순" · "2026.10 말".
 * (저장 날짜는 10일·20일·말일이라 그대로 찍으면 정확한 날짜처럼 보인다.) 형식이 아니면 그대로.
 */
export function formatPickDate(plannedDate: string, datePrecision: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(plannedDate);
  if (!m) return plannedDate;
  if (isMonthPart(datePrecision)) return `${m[1]}.${m[2]} ${MONTH_PART_LABEL[datePrecision]}`;
  if (!m[3]) return `${m[1]}.${m[2]}`;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

export function formatWon(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/** 폼에 보여 줄 "계획 600,000원" 라벨. */
export function pickAmountLabel(amount: number): string {
  return `계획 ${formatWon(amount)}`;
}

/** 제목은 비어 있을 때만 채운다. */
export function shouldFillTitle(currentTitle: string | null | undefined): boolean {
  return !currentTitle || currentTitle.trim() === "";
}

/** 회사는 사용자가 직접 고르지 않았고, 선택 가능한 목록에 있고, 지금 값과 다를 때만 바꾼다. */
export function shouldFillCompany(opts: {
  touched: boolean;
  planCompanyId: string;
  currentCompanyId: string;
  availableCompanyIds: readonly string[];
}): boolean {
  return (
    !opts.touched &&
    opts.planCompanyId !== opts.currentCompanyId &&
    opts.availableCompanyIds.includes(opts.planCompanyId)
  );
}

/**
 * 납기일을 예정일로 채울지. DAY 단위이고, 비어 있고, 오늘 이후(오늘 포함)일 때만 "YYYY-MM-DD" 를 돌려준다.
 * today 도 "YYYY-MM-DD"(KST 기준으로 호출자가 계산).
 */
export function dueDateToFill(opts: {
  datePrecision: string;
  plannedDate: string;
  currentDueDate: Date | null | undefined;
  today: string;
}): string | null {
  if (opts.datePrecision !== "DAY") return null;
  if (opts.currentDueDate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.plannedDate)) return null;
  return opts.plannedDate >= opts.today ? opts.plannedDate : null;
}

/** "YYYY-MM-DD" → 로컬 자정 Date (폼의 dueDate 가 Date 라서). */
export function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 한국 시간 기준 오늘 "YYYY-MM-DD". */
export function todayKST(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 서버가 연결에 실패했다고 알렸는지 (planId 를 보냈을 때만 값이 있다). */
export function planLinkFailed(result: unknown): boolean {
  const data = (result as { data?: { planLinked?: unknown } } | null)?.data;
  return data?.planLinked === false;
}
