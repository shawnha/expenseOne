import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as planSchema from "./schema-plans";
import { PlanError } from "@/lib/plans/errors";

// ---------------------------------------------------------------------------
// 비용계획 전용 DB 클라이언트 (integration-review P12)
//
// 기존 `src/lib/db/index.ts` 의 `db`(max 5) 와 **연결 풀을 나눈다**. 계획 쿼리가 느려지거나
// 몰려도 기존 앱(홈·/expenses·입금요청 폼)의 연결을 잡아먹지 않도록 최대 2연결만 쓴다.
//
// 모든 계획 쿼리는 `withPlanTx` 를 거친다:
//   - 트랜잭션 첫 문장이 `SET LOCAL statement_timeout = '5000'` (풀러를 거치면 연결 옵션의
//     statement_timeout 이 사라지지만 트랜잭션 안의 SET LOCAL 은 유지된다, 검토 문서 I23).
//   - 읽기 API 는 `readOnly: true` 로 열어 실수로도 쓰지 못하게 한다.
//   - 쓰기 API 는 [권한 판정] → [변경] → [plan_change_log INSERT] 가 한 트랜잭션이다(SCHEMA.md 5절 2).
//
// 이 모듈은 계획 코드(src/lib/plans/**, src/services/plan.service.ts, src/app/api/plans/**)만
// import 한다. 레이아웃·cached.ts·홈·/expenses·미들웨어에서 import 하지 않는다(P6).
// ---------------------------------------------------------------------------

const connectionString = (process.env.SUPABASE_DB_URL ?? "").trim();

if (!connectionString) {
  console.error("[PlansDB] SUPABASE_DB_URL is not set or empty");
}

const client = postgres(connectionString, {
  prepare: false,
  max: 2,
  idle_timeout: 10,
  max_lifetime: 30,
  connect_timeout: 10,
  ssl: "prefer",
  onnotice: () => {},
});

export const plansDb = drizzle(client, { schema: planSchema });

/** `withPlanTx` 콜백이 받는 트랜잭션 핸들. 서비스·권한 헬퍼는 이 타입으로만 DB 를 만진다. */
export type PlanTx = Parameters<Parameters<typeof plansDb.transaction>[0]>[0];

/** 쿼리별 상한(P12). 보드·상세 어느 쿼리도 이보다 오래 돌면 끊는다. */
export const PLAN_STATEMENT_TIMEOUT_MS = 5000;

/**
 * 트랜잭션 **전체** 예산. statement_timeout 은 문장 하나만 막는다 — 보드 한 번은
 * SET LOCAL·대표 여부·카드·프로젝트·참여자·회사·브랜드까지 7개 안팎을 줄줄이 실행하므로,
 * 느려진 DB 에서는 문장마다 4초씩 걸려도 합이 30초를 넘는다. 그러면 우리가 만든 error.tsx 대신
 * 플랫폼의 504 가 뜨고 로그에도 원인이 남지 않는다. 여기서 먼저 끊어 우리 오류로 떨어뜨린다.
 */
export const PLAN_TX_BUDGET_MS = 12_000;

export interface PlanTxOptions {
  /** true 면 `SET TRANSACTION READ ONLY` — 조회 API 전용. */
  readOnly?: boolean;
}

/**
 * 계획 쿼리를 트랜잭션으로 감싼다. 첫 문장은 항상 statement_timeout 5초.
 * 콜백이 throw 하면 롤백된다(드리즐 기본 동작).
 *
 * 예산 초과는 **트랜잭션 안에서** 던진다 — 바깥에서 race 하면 트랜잭션이 배경에 남아
 * max 2 짜리 풀의 연결을 붙잡는다. 안에서 던지면 곧바로 ROLLBACK 하고 연결을 돌려준다.
 */
export async function withPlanTx<T>(
  fn: (tx: PlanTx) => Promise<T>,
  options: PlanTxOptions = {},
): Promise<T> {
  return plansDb.transaction(
    async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${PLAN_STATEMENT_TIMEOUT_MS}'`));
      let timer: ReturnType<typeof setTimeout> | undefined;
      const budget = new Promise<never>((_, reject) => {
        timer = setTimeout(
          // statement_timeout(57014)이 내는 것과 같은 문장 — 사용자에게는 같은 일이다.
          () => reject(new PlanError("INTERNAL_ERROR", "조회 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.")),
          PLAN_TX_BUDGET_MS,
        );
      });
      try {
        return await Promise.race([fn(tx), budget]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    options.readOnly ? { accessMode: "read only" } : undefined,
  );
}
