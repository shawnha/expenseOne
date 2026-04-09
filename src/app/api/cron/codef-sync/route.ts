/**
 * Vercel Cron — Codef 거래 동기화
 *
 * 매 10분마다 실행. 모든 활성 connection 의 최근 7일 승인내역을 가져와
 * staging 테이블에 업데이트하고 신규 거래는 사용자에게 푸시 알림 전송.
 *
 * Robustness:
 * - timingSafeEqual 로 CRON_SECRET 검증
 * - pg advisory lock 으로 동시 실행 차단 (이전 cron 미완료 시 즉시 skip)
 * - maxDuration 300s (Vercel Pro 기준)
 * - 동시 5개까지 병렬 처리 (Codef rate limit 보호)
 * - 실패 시 지수 백오프 (15→30→60→120→240분)
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  codefConnections,
  notifications,
  type CodefConnection,
} from "@/lib/db/schema";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import { syncConnection, recordSyncFailure } from "@/services/codef.service";
import { sendPushToUser } from "@/services/push.service";

export const maxDuration = 300; // Vercel Pro

const CRON_LOCK_KEY = 887723341; // 임의 고정값. pg_advisory_lock 에 사용.
const CONCURRENCY = 5;

function safeAuthCheck(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (!authHeader) return false;
  const expected = `Bearer ${secret}`;
  if (authHeader.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * 간단 세마포어 — N 개까지만 동시 실행.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) break;
      try {
        const value = await fn(items[idx]!);
        results[idx] = { status: "fulfilled", value };
      } catch (reason) {
        results[idx] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function GET(request: Request) {
  if (!safeAuthCheck(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Advisory lock — 이전 sync 실행 중이면 즉시 리턴
  const lockResult = await db.execute(
    sql`SELECT pg_try_advisory_lock(${CRON_LOCK_KEY}) as locked`,
  );
  // drizzle execute 결과 형태는 driver 에 따라 다름. neon-http / node-postgres 모두 rows 배열.
  type LockRow = { locked: boolean };
  const lockRow = (lockResult as unknown as { rows?: LockRow[] }).rows?.[0]
    ?? (lockResult as unknown as LockRow[])[0];
  if (!lockRow?.locked) {
    return NextResponse.json({ ok: true, skipped: "another_sync_in_progress" });
  }

  try {
    const now = new Date();

    // 활성 + 백오프 미발동 connection 만 조회
    const conns = await db
      .select()
      .from(codefConnections)
      .where(
        and(
          eq(codefConnections.isActive, true),
          or(
            isNull(codefConnections.backoffUntil),
            lte(codefConnections.backoffUntil, now),
          ),
        ),
      );

    if (conns.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 });
    }

    let totalNew = 0;
    let totalCancelled = 0;
    let failures = 0;

    await runWithConcurrency(conns, CONCURRENCY, async (conn: CodefConnection) => {
      try {
        const { newStaging, cancelledExpenses } = await syncConnection(conn);
        totalNew += newStaging.length;
        totalCancelled += cancelledExpenses.length;

        // 신규 거래 알림
        for (const tx of newStaging) {
          const isOverseasOrUSD = tx.currency !== "KRW" || tx.isOverseas;
          const linkUrl = isOverseasOrUSD
            ? `/expenses/new/corporate-card`
            : `/expenses/new/corporate-card?stagingId=${tx.id}`;

          const title = `${tx.merchantName ?? "법카 사용"} ${tx.amount.toLocaleString()}원`;
          const message = isOverseasOrUSD
            ? "해외 결제 발견 — 수동 등록 필요"
            : "법카 사용 등록하세요";

          await db.insert(notifications).values({
            recipientId: conn.userId,
            type: "CODEF_NEW_TRANSACTION",
            title,
            message,
            linkUrl,
          });

          // Web Push (best-effort)
          await sendPushToUser(conn.userId, title, message, linkUrl).catch((err) => {
            console.error("[Codef sync] push 실패:", err);
          });
        }

        // 카드사 취소 reconciliation 알림
        for (const cancelled of cancelledExpenses) {
          const title = `카드사 취소: ${cancelled.merchantName ?? "거래"} ${cancelled.amount.toLocaleString()}원`;
          const message = "카드사에서 해당 거래가 취소되어 자동으로 취소 처리되었습니다";
          const linkUrl = `/expenses/${cancelled.expenseId}`;

          await db.insert(notifications).values({
            recipientId: conn.userId,
            type: "CODEF_TRANSACTION_CANCELLED",
            title,
            message,
            linkUrl,
            relatedExpenseId: cancelled.expenseId,
          });

          await sendPushToUser(conn.userId, title, message, linkUrl).catch((err) => {
            console.error("[Codef sync] cancel push 실패:", err);
          });
        }
      } catch (err) {
        failures++;
        console.error(`[Codef sync] connection ${conn.id} 실패:`, err);
        await recordSyncFailure(conn.id, err);
      }
    });

    return NextResponse.json({
      ok: true,
      processed: conns.length,
      newTransactions: totalNew,
      cancelledTransactions: totalCancelled,
      failures,
    });
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(${CRON_LOCK_KEY})`);
  }
}
