/**
 * 사용자별 단순 메모리 레이트 리미터.
 * 서버리스에서는 인스턴스마다 따로 세므로 best-effort 이다 (비용 폭주 방지용 안전망).
 */
export const OCR_RATE_MAX = 30;
export const OCR_RATE_WINDOW_MS = 10 * 60 * 1000;

const hits = new Map<string, number[]>();

/** 허용되면 true. now는 테스트용 */
export function checkRateLimit(
  userId: string,
  now: number = Date.now(),
  max: number = OCR_RATE_MAX,
  windowMs: number = OCR_RATE_WINDOW_MS
): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(userId, recent);
    return false;
  }
  recent.push(now);
  hits.set(userId, recent);
  // 오래된 사용자 항목 정리
  if (hits.size > 500) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    }
  }
  return true;
}

export function resetRateLimit(): void {
  hits.clear();
}
