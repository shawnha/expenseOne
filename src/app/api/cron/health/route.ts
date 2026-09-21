import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron-auth";

// ---------------------------------------------------------------------------
// Health — 외부 uptime 모니터가 1분마다 호출한다. vercel.json "crons"에는 넣지 않는다.
//
// /api/cron 아래에 두는 이유: middleware.ts SKIP_PREFIXES가 /api/cron을 건너뛰므로
// 쿠키 없는 모니터 호출이 /login 307로 바뀌지 않고 이 핸들러까지 온다.
//
// 읽기만 한다: 읽기 전용 트랜잭션에서 SELECT 1 + expenses 건수.
// 알림·Slack·푸시·쓰기 없음. push.service 등 부수효과 있는 모듈을 import하지 않는다.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const revalidate = 0;
// Hobby 기본 한도보다 짧게. DB가 멈춰도 10초 안에 끝난다.
export const maxDuration = 10;

// SET LOCAL statement_timeout(3초) + 연결 대기 여유. maxDuration보다 짧아야
// 함수 강제 종료(504) 대신 우리가 503을 돌려준다.
const DB_BUDGET_MS = 5_000;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/**
 * 모니터 전용 비밀(HEALTH_CHECK_SECRET)이 있으면 그것을 먼저 받는다.
 * CRON_SECRET은 알림을 보내는 cron 라우트(due-date-check 등)도 여는 열쇠라
 * 외부 모니터 서비스에 넘기지 않는 것이 원칙이다. 없으면 기존 verifyCronAuth와 같다.
 */
function authorize(request: Request): NextResponse | null {
  const healthSecret = process.env.HEALTH_CHECK_SECRET;
  if (healthSecret && request.headers.get("authorization") === `Bearer ${healthSecret}`) {
    return null;
  }
  return verifyCronAuth(request);
}

async function probe(): Promise<{ expenses: number }> {
  return db.transaction(
    async (tx) => {
      // 풀러를 거치면 연결 옵션의 statement_timeout(15초)이 사라진다(검토 문서 I23).
      // 트랜잭션 안의 SET LOCAL은 풀러에서도 유지된다.
      await tx.execute(sql`SET LOCAL statement_timeout = '3s'`);
      await tx.execute(sql`SELECT 1`);
      const result = await tx.execute(sql`SELECT count(*)::int AS n FROM expenseone.expenses`);
      const rows = Array.from(result as Iterable<{ n: number }>);
      return { expenses: Number(rows[0]?.n ?? -1) };
    },
    { accessMode: "read only" },
  );
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("health_timeout")), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export async function GET(request: Request) {
  const authError = authorize(request);
  if (authError) return authError;

  const started = Date.now();
  try {
    const { expenses } = await withTimeout(probe(), DB_BUDGET_MS);
    return NextResponse.json(
      { ok: true, db_ms: Date.now() - started, expenses },
      { status: 200, headers: NO_STORE },
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // 상세(호스트·사용자명이 섞일 수 있음)는 서버 로그에만 남기고 응답엔 분류만 준다.
    console.error("[Health] DB check failed:", detail);
    return NextResponse.json(
      { ok: false, db_ms: Date.now() - started, error: detail === "health_timeout" ? "timeout" : "db_error" },
      { status: 503, headers: NO_STORE },
    );
  }
}
