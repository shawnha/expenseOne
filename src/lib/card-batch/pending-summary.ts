/** 아직 안 올린 결제가 있을 때만 안내 문구를 만든다. */
export function pendingCardLabel(count: number | null | undefined): string | null {
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count <= 0) return null;
  return `아직 안 올린 결제 ${count.toLocaleString("ko-KR")}건`;
}

/**
 * 안내 링크: 요약이 센 가장 오래된 결제 날짜부터 열어야 누른 뒤 목록이 비지 않는다
 * (한 번에 올리기 화면의 기본 기간은 최근 14일이라 요약 기간 60일보다 짧다).
 */
export function pendingCardBatchHref(oldestDate: string | null | undefined): string {
  return oldestDate && /^\d{4}-\d{2}-\d{2}$/.test(oldestDate)
    ? `/expenses/new/card-batch?from=${oldestDate}`
    : "/expenses/new/card-batch";
}
