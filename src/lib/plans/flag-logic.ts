// ---------------------------------------------------------------------------
// 기능 스위치 판정·캐시 — 순수 로직 (DB 없음, 단위 테스트 대상)
//
// 규칙(0020_app_flags.sql·P1):
//   진입 = enabled AND (allow_user_ids 가 비었거나 나를 포함)
//   읽기 실패·행 없음 = OFF (fail-closed)
// 캐시는 **행 하나**(enabled + allow_user_ids)를 모듈 메모리에 20초 든다. 사용자별 결과는 캐시하지
// 않고 매번 행으로 판정한다 — 허용 목록을 바꿔도 20초 안에 모든 사용자에게 반영된다.
// ---------------------------------------------------------------------------

export interface FlagRow {
  enabled: boolean;
  allowUserIds: readonly string[];
}

/** 순수 판정. row 가 null(행 없음·읽기 실패)이면 항상 false. */
export function evaluateFlag(row: FlagRow | null | undefined, userId: string): boolean {
  if (!row || !row.enabled) return false;
  if (row.allowUserIds.length === 0) return true;
  return row.allowUserIds.includes(userId);
}

export interface FlagCacheOptions {
  /** 성공 결과 유지 시간. 기본 20초. */
  ttlMs?: number;
  /** 실패(OFF) 결과 유지 시간. 짧게 둬서 DB 가 돌아오면 금방 다시 읽는다. 기본 5초. */
  failureTtlMs?: number;
  /** 시계 주입(테스트용). */
  now?: () => number;
  /**
   * loader 가 throw 했을 때. 캐시는 예외를 삼키고 OFF 로 답하므로(fail-closed) 여기서 로그를 남기지 않으면
   * 기능이 소리 없이 사라진다(QA D-12). 이 콜백이 던져도 무시한다.
   */
  onError?: (err: unknown) => void;
}

export interface FlagCache {
  /** 캐시가 살아 있으면 그 행을, 아니면 loader 로 읽어 캐시한다. loader 가 throw 하면 null 을 캐시한다. */
  get(loader: () => Promise<FlagRow | null>): Promise<FlagRow | null>;
  /** 캐시를 비운다(테스트·수동 갱신용). */
  clear(): void;
}

export function createFlagCache(options: FlagCacheOptions = {}): FlagCache {
  const ttlMs = options.ttlMs ?? 20_000;
  const failureTtlMs = options.failureTtlMs ?? 5_000;
  const now = options.now ?? Date.now;
  const onError = options.onError;

  let cached: { row: FlagRow | null; expiresAt: number } | null = null;
  let inflight: Promise<FlagRow | null> | null = null;

  return {
    async get(loader) {
      const t = now();
      if (cached && t < cached.expiresAt) return cached.row;
      // 같은 인스턴스에서 동시에 들어온 요청은 한 번만 읽는다.
      if (inflight) return inflight;
      inflight = (async () => {
        let row: FlagRow | null;
        let ok = true;
        try {
          row = await loader();
        } catch (err) {
          row = null;
          ok = false;
          try {
            onError?.(err);
          } catch {
            // 로그 콜백의 실패가 판정을 바꾸면 안 된다
          }
        }
        const ttl = ok && row ? ttlMs : failureTtlMs;
        cached = { row, expiresAt: now() + ttl };
        return row;
      })();
      try {
        return await inflight;
      } finally {
        inflight = null;
      }
    },
    clear() {
      cached = null;
    },
  };
}
