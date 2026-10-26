/** 아직 안 올린 결제가 있을 때만 안내 문구를 만든다. */
export function pendingCardLabel(count: number | null | undefined): string | null {
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count <= 0) return null;
  return `아직 안 올린 결제 ${count.toLocaleString("ko-KR")}건`;
}
