// ---------------------------------------------------------------------------
// "ERP 반영함" 표시 문구 (DB·React 없음, 단위 테스트 대상 — src/lib/validations/plan.test.ts)
//
// 대표가 계획을 ERP 현금흐름 예상에 손으로 넣었다고 표시한다(0023). 자동 반영과 무관한 장부 표시다.
// 날짜는 **KST 로** 적는다 — 상세 화면은 서버(UTC)에서 먼저 그려지므로 로컬 시각으로 적으면
// 자정 근처에서 서버·브라우저가 다른 날짜를 그린다.
// ---------------------------------------------------------------------------

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const pad2 = (n: number) => String(n).padStart(2, "0");

/** ISO 시각 → KST "yyyy.mm.dd". 읽을 수 없으면 null. */
export function kstDateLabel(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + KST_OFFSET_MS);
  return `${d.getUTCFullYear()}.${pad2(d.getUTCMonth() + 1)}.${pad2(d.getUTCDate())}`;
}

/** "2026.09.22 · 하승완". 표시가 없으면 null. 표시한 사람이 지워졌으면(이름 NULL) 날짜만. */
export function erpAppliedStamp(at: string | null, byName: string | null): string | null {
  if (at === null) return null;
  const date = kstDateLabel(at);
  if (date === null) return byName;
  return byName ? `${date} · ${byName}` : date;
}

/** 대표가 아닌 사람(또는 잠긴 계획)이 보는 읽기 전용 한 줄. */
export function erpAppliedText(at: string | null, byName: string | null): string {
  if (at === null) return "아직 반영 안 됨";
  const stamp = erpAppliedStamp(at, byName);
  return stamp ? `반영됨 · ${stamp}` : "반영됨";
}

/** 카드 빠른 메뉴의 항목 이름 — 지금 상태의 반대 동작. */
export function erpMenuLabel(applied: boolean): string {
  return applied ? "ERP 반영 해제" : "ERP 반영 표시";
}

/** 바꾼 뒤 토스트. next = 바뀐 뒤 상태. */
export function erpToggleToast(next: boolean): string {
  return next ? "ERP 반영으로 표시했습니다." : "ERP 반영 표시를 해제했습니다.";
}
