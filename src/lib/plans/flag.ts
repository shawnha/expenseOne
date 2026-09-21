import { eq } from "drizzle-orm";
import { withPlanTx } from "@/lib/db/plans-client";
import { appFlags } from "@/lib/db/schema-plans";
import { summarizeError } from "./errors";
import { createFlagCache, evaluateFlag, type FlagRow } from "./flag-logic";

// ---------------------------------------------------------------------------
// 비용계획 스위치 읽기 (P1). expenseone.app_flags 의 key='cost_planning' 행 하나.
// 모듈 메모리 20초 캐시, 어떤 오류든 OFF. 끄기 = UPDATE 한 줄, 배포 없음.
// ---------------------------------------------------------------------------

export const COST_PLANNING_FLAG_KEY = "cost_planning";

const cache = createFlagCache({
  ttlMs: 20_000,
  failureTtlMs: 5_000,
  // 읽기 실패는 OFF(404)로 조용히 넘어가므로 로그가 유일한 단서다(QA D-12). params 없는 요약만.
  onError: (err) => {
    const s = summarizeError(err);
    console.error(`[Plans] flag read failed — treating as OFF: ${s.name}${s.code ? ` ${s.code}` : ""}: ${s.message}`);
  },
});

async function loadFlagRow(): Promise<FlagRow | null> {
  const [row] = await withPlanTx(
    (tx) =>
      tx
        .select({ enabled: appFlags.enabled, allowUserIds: appFlags.allowUserIds })
        .from(appFlags)
        .where(eq(appFlags.key, COST_PLANNING_FLAG_KEY))
        .limit(1),
    { readOnly: true },
  );
  if (!row) return null;
  return { enabled: row.enabled, allowUserIds: row.allowUserIds ?? [] };
}

/**
 * 이 사용자가 비용계획에 들어갈 수 있나. 실패는 전부 false(fail-closed).
 * 라우트·페이지는 false 면 404 로 응답한다(존재를 알리지 않는다).
 */
export async function isCostPlanningAllowed(userId: string): Promise<boolean> {
  try {
    const row = await cache.get(loadFlagRow);
    return evaluateFlag(row, userId);
  } catch (err) {
    // 캐시가 loader 예외를 삼키므로 여기까지 오는 일은 거의 없다 — 마지막 안전망.
    const s = summarizeError(err);
    console.error(`[Plans] flag evaluate failed — treating as OFF: ${s.name}: ${s.message}`);
    return false;
  }
}

/** 테스트·운영 점검용. 캐시를 비워 다음 호출이 DB 를 다시 읽게 한다. */
export function clearCostPlanningFlagCache(): void {
  cache.clear();
}
