import { eq } from "drizzle-orm";
import { withPlanTx } from "@/lib/db/plans-client";
import { appFlags } from "@/lib/db/schema-plans";
import { createFlagCache, evaluateFlag, type FlagRow } from "./flag-logic";

// ---------------------------------------------------------------------------
// 비용계획 스위치 읽기 (P1). expenseone.app_flags 의 key='cost_planning' 행 하나.
// 모듈 메모리 20초 캐시, 어떤 오류든 OFF. 끄기 = UPDATE 한 줄, 배포 없음.
// ---------------------------------------------------------------------------

export const COST_PLANNING_FLAG_KEY = "cost_planning";

const cache = createFlagCache({ ttlMs: 20_000, failureTtlMs: 5_000 });

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
    console.error("[Plans] flag read failed — treating as OFF:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** 테스트·운영 점검용. 캐시를 비워 다음 호출이 DB 를 다시 읽게 한다. */
export function clearCostPlanningFlagCache(): void {
  cache.clear();
}
