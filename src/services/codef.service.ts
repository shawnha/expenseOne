/**
 * Codef 연동 서비스 레이어
 *
 * - createConnection: 카드사 자격증명으로 connectedId 발급 + DB 저장
 * - syncConnection: 한 connection 의 최근 7일 승인내역 fetch + staging upsert
 * - reconcileCancellations: 카드사에서 취소된 거래를 expense → CANCELLED 로 전환
 * - listConnections / deactivateConnection: UI 에서 사용
 */

import { db } from "@/lib/db";
import {
  codefConnections,
  codefTransactionsStaging,
  expenses,
  type CodefConnection,
  type NewCodefTransactionStaging,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  getCodefClient,
  getServiceType,
  parseCodefResponse,
  CODEF_PRODUCT_URL,
  CARD_COMPANY_CODES,
  type CardCompanyKey,
} from "@/lib/codef/client";
import {
  encryptConnectedId,
  decryptConnectedId,
} from "@/lib/crypto/connected-id";

// ---------------------------------------------------------------------------
// Types — Codef approval-list 응답 (상위 필드만 추림)
// ---------------------------------------------------------------------------

interface CodefApprovalRow {
  resCardNo: string;
  resApprovalNo: string;
  resApprovalDate: string; // YYYYMMDD
  resApprovalTime?: string; // HHMMSS
  resUsedAmount: string; // 숫자 문자열
  resMemberStoreName?: string;
  resMemberStoreType?: string;
  resCancelYN?: string; // "0" | "1" 또는 "Y" | "N"
  resOverseasYN?: string;
  resCurrency?: string;
  resForeignAmount?: string;
  resInstallment?: string; // "00" = 일시불
}

// ---------------------------------------------------------------------------
// Connection 관리
// ---------------------------------------------------------------------------

interface CreateConnectionInput {
  userId: string;
  cardCompany: CardCompanyKey;
  loginId: string;
  loginPassword: string;
  loginType?: "1" | "0"; // 1=ID/PW, 0=공동인증서
}

export async function createConnection(input: CreateConnectionInput): Promise<CodefConnection> {
  const codef = getCodefClient();
  const serviceType = getServiceType();
  const cardInfo = CARD_COMPANY_CODES[input.cardCompany];
  if (!cardInfo) {
    throw new Error(`지원하지 않는 카드사: ${input.cardCompany}`);
  }

  const param = {
    accountList: [
      {
        countryCode: "KR",
        businessType: "CD", // 카드
        clientType: "P", // 개인
        organization: cardInfo.code,
        loginType: input.loginType ?? "1",
        id: input.loginId,
        password: input.loginPassword, // SDK 가 RSA 암호화 처리
      },
    ],
  };

  const raw = await codef.createAccount(serviceType, param);
  const parsed = parseCodefResponse<{ connectedId?: string; resRegisterAccountList?: Array<{ errCode?: string; errMessage?: string }> }>(raw);

  if (parsed.result.code !== "CF-00000") {
    throw new Error(
      `Codef 계정 등록 실패: ${parsed.result.code} ${parsed.result.message ?? ""}`,
    );
  }
  if (!parsed.data.connectedId) {
    const sub = parsed.data.resRegisterAccountList?.[0];
    throw new Error(
      `Codef connectedId 미발급: ${sub?.errCode ?? ""} ${sub?.errMessage ?? ""}`,
    );
  }

  const encrypted = encryptConnectedId(parsed.data.connectedId);

  const [row] = await db
    .insert(codefConnections)
    .values({
      userId: input.userId,
      connectedIdEncrypted: encrypted,
      cardCompany: input.cardCompany,
      isActive: true,
    })
    .returning();

  return row;
}

export async function listUserConnections(userId: string): Promise<CodefConnection[]> {
  return db
    .select()
    .from(codefConnections)
    .where(
      and(
        eq(codefConnections.userId, userId),
        eq(codefConnections.isActive, true),
      ),
    );
}

export async function deactivateConnection(connectionId: string, userId: string): Promise<void> {
  await db
    .update(codefConnections)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(codefConnections.id, connectionId),
        eq(codefConnections.userId, userId),
      ),
    );
}

// ---------------------------------------------------------------------------
// 거래 동기화
// ---------------------------------------------------------------------------

function ymdNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function ymdToday(): string {
  return ymdNDaysAgo(0);
}

function isCancelled(value?: string): boolean {
  return value === "Y" || value === "1";
}

function parseAmount(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9-]/g, "");
  return parseInt(cleaned, 10) || 0;
}

interface SyncResult {
  newStaging: typeof codefTransactionsStaging.$inferSelect[];
  cancelledExpenses: { expenseId: string; merchantName: string | null; amount: number }[];
}

export async function syncConnection(connection: CodefConnection): Promise<SyncResult> {
  const codef = getCodefClient();
  const serviceType = getServiceType();
  const cardInfo = CARD_COMPANY_CODES[connection.cardCompany as CardCompanyKey];
  if (!cardInfo) {
    throw new Error(`지원하지 않는 카드사 코드: ${connection.cardCompany}`);
  }

  const connectedId = decryptConnectedId(connection.connectedIdEncrypted);

  const param = {
    connectedId,
    organization: cardInfo.code,
    startDate: ymdNDaysAgo(7),
    endDate: ymdToday(),
    orderBy: "0", // 0=내림차순
    inquiryType: "1", // 일시불+할부 모두
  };

  const raw = await codef.requestProduct(
    CODEF_PRODUCT_URL.PERSONAL_CARD_APPROVAL,
    serviceType,
    param,
  );
  const parsed = parseCodefResponse<{ resApprovalList?: CodefApprovalRow[] }>(raw);

  if (parsed.result.code !== "CF-00000") {
    throw new Error(
      `Codef 승인내역 조회 실패: ${parsed.result.code} ${parsed.result.message ?? ""}`,
    );
  }

  const rows = parsed.data.resApprovalList ?? [];
  const newStaging: typeof codefTransactionsStaging.$inferSelect[] = [];
  const cancelledExpenses: SyncResult["cancelledExpenses"] = [];

  for (const row of rows) {
    const cancelled = isCancelled(row.resCancelYN);
    const overseas = row.resOverseasYN === "Y" || row.resOverseasYN === "1";
    const amount = parseAmount(row.resUsedAmount);

    const stagingValue: NewCodefTransactionStaging = {
      userId: connection.userId,
      connectionId: connection.id,
      resApprovalNo: row.resApprovalNo,
      resApprovalDate: row.resApprovalDate,
      resApprovalTime: row.resApprovalTime ?? "",
      resCardNo: row.resCardNo,
      amount,
      currency: row.resCurrency ?? "KRW",
      merchantName: row.resMemberStoreName ?? null,
      merchantType: row.resMemberStoreType ?? null,
      isCancelled: cancelled,
      isOverseas: overseas,
      rawPayload: row as unknown as Record<string, unknown>,
    };

    // ON CONFLICT 로 dedup. 이미 있으면 isCancelled 만 업데이트.
    const inserted = await db
      .insert(codefTransactionsStaging)
      .values(stagingValue)
      .onConflictDoUpdate({
        target: [
          codefTransactionsStaging.userId,
          codefTransactionsStaging.resCardNo,
          codefTransactionsStaging.resApprovalDate,
          codefTransactionsStaging.resApprovalTime,
          codefTransactionsStaging.resApprovalNo,
        ],
        set: { isCancelled: cancelled },
      })
      .returning();

    if (inserted[0]) {
      // 새로 들어왔거나 업데이트된 row.
      // "새로운 거래" 판단: status='pending' 이고 fetched_at 이 방금 이내
      const r = inserted[0];
      const isNew =
        r.status === "pending" &&
        Date.now() - new Date(r.fetchedAt).getTime() < 60_000; // 1분 이내 = 방금 INSERT

      if (isNew && !cancelled) {
        newStaging.push(r);
      }

      // 취소 reconciliation: 이미 consumed 된 거래가 카드사 취소되면 expense → CANCELLED
      if (cancelled && r.consumedExpenseId && r.status === "consumed") {
        const [exp] = await db
          .update(expenses)
          .set({
            status: "CANCELLED",
            rejectionReason: "카드사에서 거래 취소됨",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(expenses.id, r.consumedExpenseId),
              sql`${expenses.status} != 'CANCELLED'`,
            ),
          )
          .returning();
        if (exp) {
          cancelledExpenses.push({
            expenseId: exp.id,
            merchantName: r.merchantName,
            amount: r.amount,
          });
          await db
            .update(codefTransactionsStaging)
            .set({ status: "cancelled_by_card" })
            .where(eq(codefTransactionsStaging.id, r.id));
        }
      }
    }
  }

  // connection 상태 업데이트
  await db
    .update(codefConnections)
    .set({
      lastSyncAt: new Date(),
      lastSyncStatus: "ok",
      lastSyncError: null,
      backoffUntil: null,
      consecutiveFailures: 0,
      updatedAt: new Date(),
    })
    .where(eq(codefConnections.id, connection.id));

  return { newStaging, cancelledExpenses };
}

// ---------------------------------------------------------------------------
// 백오프 계산
// ---------------------------------------------------------------------------

const BACKOFF_MINUTES = [15, 30, 60, 120, 240]; // 지수 백오프 캡

export function computeBackoffMinutes(consecutiveFailures: number): number {
  const idx = Math.min(consecutiveFailures, BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[idx]!;
}

export async function recordSyncFailure(
  connectionId: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const [conn] = await db
    .select({ failures: codefConnections.consecutiveFailures })
    .from(codefConnections)
    .where(eq(codefConnections.id, connectionId));

  const nextFailures = (conn?.failures ?? 0) + 1;
  const backoffMin = computeBackoffMinutes(nextFailures - 1);

  await db
    .update(codefConnections)
    .set({
      lastSyncStatus: "error",
      lastSyncError: message.slice(0, 500),
      backoffUntil: new Date(Date.now() + backoffMin * 60_000),
      consecutiveFailures: nextFailures,
      updatedAt: new Date(),
    })
    .where(eq(codefConnections.id, connectionId));
}
