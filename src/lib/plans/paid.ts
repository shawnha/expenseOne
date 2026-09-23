// ---------------------------------------------------------------------------
// "지급 완료" 표시 문구 (DB·React 없음, 단위 테스트 대상 — src/lib/plans/paid.test.ts)
//
// 실제로 돈이 나간 계획에 참여자 누구나 다는 표시다(0025). 표시하면 카드가 한 줄로 접히고
// 그 달 맨 아래로 내려간다. 날짜는 ERP 표시와 같은 이유로 KST 로 적는다(kstDateLabel).
// ---------------------------------------------------------------------------

import { kstDateLabel } from "./erp";

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
