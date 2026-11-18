// ---------------------------------------------------------------------------
// 법카 정기 결제 (0031) — DB·React 없음, 단위 테스트 대상(src/lib/card-subscription.test.ts)
//
// 가맹점 키는 자동 채우기와 같은 규칙(lib/utils/autofill.ts merchantKey = trim + 소문자)을 쓴다.
// 같은 사람이 같은 가맹점에서 낸 결제는 같은 정기 결제로 묶인다.
// ---------------------------------------------------------------------------

import { merchantKey } from "@/lib/utils/autofill";

/** 가맹점이라 볼 수 없는 값 — 폼의 「기타」 버튼(자동 채우기의 NOT_A_MERCHANT 와 같다). */
const NOT_A_MERCHANT = new Set(["기타"]);

/** 정기 결제를 묶는 가맹점 키. 가맹점이 비었거나 「기타」면 null(정기 결제로 표시할 수 없다). */
export function subscriptionKeyOf(merchantName: string | null | undefined): string | null {
  const key = merchantKey(merchantName);
  return key === "" || NOT_A_MERCHANT.has(key) ? null : key;
}

/** 생성 응답에서 「정기 결제 표시가 실패했다」를 읽는다(비용은 올라갔다). */
export function subscriptionMarkFailed(result: unknown): boolean {
  const data = (result as { data?: { subscriptionMarked?: unknown } } | null)?.data;
  return data?.subscriptionMarked === false;
}

export interface SubscriptionSummaryRow {
  isActive: boolean;
  /** 마지막 결제 금액(원). 결제가 하나도 안 남았으면 null. */
  lastAmount: number | null;
}

/** 목록 머리의 "한 달 약 N원" — 켜져 있는 정기 결제의 마지막 결제 금액 합. */
export function monthlyEstimate(rows: SubscriptionSummaryRow[]): { count: number; total: number } {
  let count = 0;
  let total = 0;
  for (const r of rows) {
    if (!r.isActive) continue;
    count += 1;
    total += r.lastAmount ?? 0;
  }
  return { count, total };
}

/**
 * 마지막 결제가 오래됐는지(해지했는데 표시만 켜져 있는 구독 찾기). 마지막 결제일(yyyy-mm-dd)이
 * 오늘(yyyy-mm-dd, KST)보다 45일 넘게 앞이면 true. 결제 기록이 없으면 false.
 */
export function isStale(lastChargeDate: string | null, today: string, days = 45): boolean {
  if (!lastChargeDate) return false;
  const a = Date.parse(`${lastChargeDate}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return (b - a) / 86_400_000 > days;
}
