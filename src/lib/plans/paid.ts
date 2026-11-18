// ---------------------------------------------------------------------------
// "지급 완료" 표시 문구 (DB·React 없음, 단위 테스트 대상 — src/lib/plans/paid.test.ts)
//
// 실제로 돈이 나간 계획에 참여자 누구나 다는 표시다(0025). 표시하면 카드가 한 줄로 접히고
// 그 달 맨 아래로 내려간다. 날짜는 ERP 표시와 같은 이유로 KST 로 적는다(kstDateLabel).
// ---------------------------------------------------------------------------

import { kstDateLabel } from "./erp";
import { isPartialPrePaid } from "../utils/pre-paid";

/** "2026.09.23 · 하승완". 표시가 없으면 null. 표시한 사람이 지워졌으면(이름 NULL) 날짜만. */
export function paidStamp(at: string | null, byName: string | null): string | null {
  if (at === null) return null;
  const date = kstDateLabel(at);
  if (date === null) return byName;
  return byName ? `${date} · ${byName}` : date;
}

/** 읽기 전용 한 줄(취소·마감된 계획). */
export function paidText(at: string | null, byName: string | null): string {
  if (at === null) return "아직 안 나감";
  const stamp = paidStamp(at, byName);
  return stamp ? `지급 완료 · ${stamp}` : "지급 완료";
}

/** 카드 빠른 메뉴의 항목 이름 — 지금 상태의 반대 동작. */
export function paidMenuLabel(paid: boolean): string {
  return paid ? "지급 완료 해제" : "지급 완료 표시";
}

/** 바꾼 뒤 토스트. next = 바뀐 뒤 상태. */
export function paidToggleToast(next: boolean): string {
  return next ? "지급 완료로 표시했습니다." : "지급 완료 표시를 해제했습니다.";
}

/** 달 머리의 둘째 줄. 지급 완료가 없으면 null — 있을 때만 "미지급"을 따로 말한다. */
export function unpaidNote(unpaidTotal: number, paidCount: number): string | null {
  if (paidCount === 0) return null;
  return `지급 완료 ${paidCount}건 · 미지급 ${unpaidTotal.toLocaleString("ko-KR")}원`;
}

// ---------------------------------------------------------------------------
// 자동 「지급 완료」(입금요청 승인 시) — 언제 찍나
//
// 계획에 걸린(해제 안 된) 비용이 **전부 돈이 다 나간 상태**일 때만 찍는다. 금액은 보지 않는다(계획은 추정이다).
//   - 승인(APPROVED)이어야 한다. 법카는 올리면 바로 승인이라 그대로 나간 돈이다.
//   - 부분 선지급 건은 후지급까지 승인돼야 한다 — 선지급만 나갔을 때 찍으면 「계획에서 불러오기」에서
//     빠지고(paid_at IS NULL 필터) 달 머리의 미지급 합계에서도 빠져 남은 돈이 안 보인다.
//   - 반려·취소된 건은 나갈 돈이 아니라 세지 않는다. 남는 게 없으면 찍지 않는다.
// ---------------------------------------------------------------------------


export interface LinkedPayoutState {
  status: string;
  isPrePaid: boolean;
  prePaidPercentage: number | null;
  remainingPaymentApproved: boolean;
}

/** 이 비용의 돈이 다 나갔나. */
export function isFullyPaidOut(e: LinkedPayoutState): boolean {
  if (e.status !== "APPROVED") return false;
  return !isPartialPrePaid(e) || e.remainingPaymentApproved;
}

/** 계획에 걸린 비용들로 보아 자동으로 「지급 완료」를 찍어도 되나. */
export function shouldAutoMarkPaid(links: LinkedPayoutState[]): boolean {
  const live = links.filter((l) => l.status !== "REJECTED" && l.status !== "CANCELLED");
  return live.length > 0 && live.every(isFullyPaidOut);
}

/** 이력(after_data)에 남기는 표시 — 승인 취소 때 사람이 직접 찍은 표시는 지우지 않으려고 구분한다. */
export const AUTO_PAID_REASON = "입금요청 승인 — 자동 지급 완료";
export const AUTO_UNPAID_REASON = "승인 취소 — 자동 지급 완료 해제";

/** 가장 최근 「지급」 이력이 자동으로 찍은 것인가(after_data = { paid: true, auto: true }). */
export function lastPaidMarkWasAuto(afterData: unknown): boolean {
  const d = afterData as { paid?: unknown; auto?: unknown } | null | undefined;
  return d?.paid === true && d?.auto === true;
}
