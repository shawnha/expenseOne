/**
 * 키(사용자)별 단순 메모리 레이트 리미터.
 * 서버리스에서는 인스턴스마다 따로 세므로 best-effort 이다 (비용 폭주 방지용 안전망).
 */
export const OCR_RATE_MAX = 30;
export const OCR_RATE_WINDOW_MS = 10 * 60 * 1000;

export interface RateLimiter {
  /** 허용되면 true. now는 테스트용 */
  check(key: string, now?: number): boolean;
  reset(): void;
}

export function createRateLimiter(
  opts: { max?: number; windowMs?: number } = {}
): RateLimiter {
  const max = opts.max ?? OCR_RATE_MAX;
  const windowMs = opts.windowMs ?? OCR_RATE_WINDOW_MS;
  const hits = new Map<string, number[]>();
  return {
    check(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      // 오래된 항목 정리
      if (hits.size > 500) {
        for (const [k, v] of hits) {
          if (v.every((t) => now - t >= windowMs)) hits.delete(k);
        }
      }
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}
