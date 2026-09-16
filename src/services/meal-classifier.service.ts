import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { MEAL_LEAF_CODES } from "@/lib/erp/meal-accounts";

// ---------------------------------------------------------------------------
// 식비 판정 — 가맹점 이름이 식비 계정에 걸리는가
//
// 룰은 **한아원 ERP(`hanahone_erp`)가 원본**이다. 원래 FinanceOne이 갖고 있었고
// 익스펜스원도 `financeone.mapping_rules`를 읽었는데, 2026-08-21에 ERP로 컷오버
// 됐다(ERP 저장소 `CUTOVER_DONE=1`). `financeone` 쪽 테이블은 같은 내용을 담은
// 거울로 남아 있지만, ERP 테이블에만 있는 컬럼이 있다 — 특히 `ambiguous`
// (ERP가 "이 룰은 애매하니 자동배정 금지"로 표시한 것). 거울을 읽으면 그 판단을
// 볼 수 없어서, 시간이 갈수록 익스펜스원만 폐기된 룰로 자동분류하게 된다.
//
// ⚠️ `similarity()`는 여전히 `financeone.similarity`로 부른다. pg_trgm 확장이
// 그 스키마에 설치돼 있기 때문이다(ERP도 search_path로 같은 우회를 한다).
// 확장을 `extensions`로 옮기면 여기도 같이 바꿔야 한다 — ERP와 함께 해야 하는 일.
//
// 예전엔 2단계(과거 거래 다수결)도 있었지만 걷어냈다. 그 근거 테이블
// (`financeone.transactions`)은 2026-07-04 이후 유입이 끊겼고, 여태 그 경로로
// 분류된 건 5건(마지막 2026-08-29)뿐이다. 더 나은 이력 매칭이 필요하면
// 익스펜스원이 흉내내는 게 아니라 ERP가 붙인 계정을 그대로 읽는 쪽이 맞다
// (최근 60일 311건 중 310건이 같은 판정이었다).
// ---------------------------------------------------------------------------

export interface MealClassification {
  internalAccountId: number;
  accountCode: string;
  accountName: string;
  source: "mapping_rules";
}

type MappingRuleHit = {
  internal_account_id: number;
  code: string;
  name: string;
  is_meal: boolean;
} & Record<string, unknown>;

/**
 * 가맹점 이름을 식비 계정으로 판정한다. 확신이 없으면 null —
 * 호출부는 평소대로 사용자에게 알림을 보낸다.
 *
 * **실패해도 절대 예외를 던지지 않는다.** 이 함수는 카드 동기화 루프 한가운데서
 * 거래마다 불린다. 예외가 올라가면 그 시점부터 동기화가 통째로 멈춰서, 식비만이
 * 아니라 **모든 사람의 카드 알림**이 끊긴다.
 */
export async function classifyMealExpense(
  storeName: string | null | undefined,
  entityId: number | null,
): Promise<MealClassification | null> {
  if (!storeName || !entityId) return null;
  const trimmed = storeName.trim();
  if (!trimmed) return null;

  const codesList = sql.join(
    Array.from(MEAL_LEAF_CODES).map((c) => sql`${c}`),
    sql`, `,
  );

  try {
    const result = await db.execute<MappingRuleHit>(sql`
      SELECT
        mr.internal_account_id,
        ia.code,
        ia.name,
        (ia.code IN (${codesList})) AS is_meal
      FROM hanahone_erp.mapping_rules mr
      JOIN hanahone_erp.internal_accounts ia ON ia.id = mr.internal_account_id
      WHERE mr.entity_id = ${entityId}
        AND NOT coalesce(mr.ambiguous, false)
        AND (
          mr.counterparty_pattern = ${trimmed}
          OR financeone.similarity(mr.counterparty_pattern, ${trimmed}) >= 0.5
        )
      ORDER BY
        (mr.counterparty_pattern = ${trimmed}) DESC,
        financeone.similarity(mr.counterparty_pattern, ${trimmed}) DESC,
        mr.confidence DESC,
        mr.hit_count DESC,
        -- 완전 동점이면 **나중에 만든 룰**이 이긴다. 이 마지막 기준이 없으면
        -- 승자가 테이블의 물리적 행 순서로 갈려서, 같은 가맹점이 실행마다 다르게
        -- 분류될 수 있다(실제로 "NOTION …" 룰 두 개가 유사도·신뢰도·적중수까지
        -- 동점이라 스키마에 따라 다른 계정이 나왔다).
        mr.id DESC
      LIMIT 1
    `);

    const top = (result as unknown as MappingRuleHit[])[0];
    if (!top || !top.is_meal) return null;

    return {
      internalAccountId: top.internal_account_id,
      accountCode: top.code,
      accountName: top.name,
      source: "mapping_rules",
    };
  } catch (err) {
    // 판정 실패 = "식비인지 모르겠다". 평소 흐름(사용자 알림)으로 넘긴다.
    console.error("[meal-classifier] 룰 조회 실패 — 알림 흐름으로 넘어갑니다:", err);
    return null;
  }
}
