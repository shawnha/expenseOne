import { db } from "@/lib/db";
import { expenses, notifications, purchaseInvoiceLines, users } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  assertConvertible,
  ConvertError,
  CONVERT_REASONS,
} from "@/lib/expense-convert";
import type { ConvertToCardInput } from "@/lib/validations/expense";
import { AppError } from "./attachment.service";
import { notifySlackDepositConvertedToCard } from "./slack.service";

// ---------------------------------------------------------------------------
// convertDepositRequestToCard -- 입금요청(SUBMITTED) → 법카 사용(APPROVED)
//
// createExpense가 법카를 만드는 모양과 같게 맞춘다: status APPROVED, approvedAt 지금,
// approvedById 없음(법카 승인은 관리자 행위가 아니다), cardLastFour는 **제출자**
// 프로필의 끝 4자리. 카드 동기화(gowid.service)의 중복 판정이
// 제출자 + CORPORATE_CARD + 금액 + cardLastFour + 거래일 ±2일이라, 이 네 값이
// 맞아야 나중에 들어오는 카드 내역이 이 건에 흡수되고 두 번 잡히지 않는다.
//
// updateExpense·approveExpense는 건드리지 않는다 — 유형과 상태를 한 번에 바꾸는
// 동작은 그쪽의 잠금·재승인 규칙과 섞이면 안 된다.
// ---------------------------------------------------------------------------

/** 이 건을 원거래로 가리키는 반품(REFUND) 행. */
const hasRefundChildrenSql = sql<boolean>`EXISTS (
  SELECT 1 FROM ${expenses} r WHERE r.original_expense_id = ${expenses.id}
)`;

/**
 * 비용계획 활성 연결. 계획 표는 schema-plans.ts에만 선언돼 있고 그 모듈은 계획 코드만
 * import하기로 돼 있어(P6) plan.service와 같이 표 이름을 그대로 쓴다.
 */
const hasActivePlanLinkSql = sql<boolean>`EXISTS (
  SELECT 1 FROM expenseone.plan_expense_links x
   WHERE x.expense_id = ${expenses.id} AND x.unlinked_at IS NULL
)`;

/** 사입 줄. isPurchase가 false여도 줄이 남아 있으면(고아 줄) 발행 추적이 깨지므로 막는다. */
const hasPurchaseLinesSql = sql<boolean>`EXISTS (
  SELECT 1 FROM ${purchaseInvoiceLines} l WHERE l.expense_id = ${expenses.id}
)`;

export async function convertDepositRequestToCard(
  expenseId: string,
  actor: { id: string; role: "MEMBER" | "ADMIN" },
  input: ConvertToCardInput,
) {
  const merchantName = input.merchantName?.trim() || null;

  const { updated, submitter } = await db.transaction(async (tx) => {
    // 1. 현재 행 + 얽힌 기록을 한 번에 읽는다.
    const [row] = await tx
      .select({
        expense: expenses,
        hasActiveLinks: hasActivePlanLinkSql,
        hasChildren: hasRefundChildrenSql,
        hasLines: hasPurchaseLinesSql,
        submitter: {
          name: users.name,
          email: users.email,
          cardLastFour: users.cardLastFour,
        },
      })
      .from(expenses)
      .leftJoin(users, eq(users.id, expenses.submittedById))
      .where(eq(expenses.id, expenseId));

    if (!row) {
      throw new AppError("NOT_FOUND", "비용을 찾을 수 없습니다.");
    }

    // 2. 자격 — 규칙은 순수 모듈에 있고 화면 버튼도 같은 걸 본다.
    const check = assertConvertible(row.expense, actor, row.hasActiveLinks, row.hasChildren);
    if (!check.ok) {
      throw new ConvertError(check.code, check.reason);
    }
    if (row.hasLines) {
      throw new ConvertError("CONFLICT", CONVERT_REASONS.purchase);
    }

    // 3. 변경. 읽은 뒤 상태가 바뀌었을 수 있으니(관리자 승인·연결 추가) 자격 조건을
    //    WHERE에 다시 건다 — 0행이면 새로고침을 안내한다(updateExpense와 같은 TOCTOU 처리).
    const now = new Date();
    const [changed] = await tx
      .update(expenses)
      .set({
        type: "CORPORATE_CARD",
        status: "APPROVED",
        approvedAt: now,
        approvedById: null,
        cardLastFour: row.submitter?.cardLastFour ?? null,
        merchantName,
        transactionDate: input.transactionDate,
        // 계좌 입금이 아니므로 지급 정보는 전부 비운다. 원천징수도 카드 결제엔 없다.
        bankName: null,
        accountHolder: null,
        accountNumber: null,
        dueDate: null,
        isPrePaid: false,
        prePaidPercentage: null,
        hasFreelancerWithholding: false,
        updatedAt: now,
      })
      .where(
        and(
          eq(expenses.id, expenseId),
          eq(expenses.type, "DEPOSIT_REQUEST"),
          eq(expenses.status, "SUBMITTED"),
          eq(expenses.isPurchase, false),
          eq(expenses.remainingPaymentRequested, false),
          eq(expenses.remainingPaymentApproved, false),
          sql`NOT ${hasActivePlanLinkSql}`,
          sql`NOT ${hasRefundChildrenSql}`,
          sql`NOT ${hasPurchaseLinesSql}`,
        ),
      )
      .returning();

    if (!changed) {
      throw new ConvertError("CONFLICT", "비용 상태가 변경되었습니다. 페이지를 새로고침해주세요.");
    }

    // 4. 관리자에게 갔던 '새 입금요청' 알림은 읽음 처리한다 — 승인할 게 없어졌다.
    //    notifications.related_expense_id가 비용을 가리킨다. 새 알림 유형은 만들지 않는다.
    await tx
      .update(notifications)
      .set({ isRead: true, readAt: now })
      .where(
        and(
          eq(notifications.relatedExpenseId, expenseId),
          eq(notifications.type, "NEW_DEPOSIT_REQUEST"),
          eq(notifications.isRead, false),
        ),
      );

    return { updated: changed, submitter: row.submitter };
  });

  // 5. Slack — 입금요청 메시지를 지우고 법카 형식으로 다시 올린다(primary + mirror).
  //    원본 게시가 실패해 좌표가 없어도 새로 올린다: 채널에는 법카 등록이 보여야 한다.
  //    실패해도 변경 자체는 이미 끝났다(로그만 남긴다).
  if (submitter) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    try {
      const posted = await notifySlackDepositConvertedToCard({
        slackMessageTs: updated.slackMessageTs,
        slackChannelId: updated.slackChannelId,
        mirrorSlackMessageTs: updated.mirrorSlackMessageTs,
        mirrorSlackChannelId: updated.mirrorSlackChannelId,
        submitterEmail: submitter.email,
        submitterName: submitter.name,
        title: updated.title,
        amount: updated.amount,
        category: updated.category,
        expenseUrl: `${appUrl}/expenses/${updated.id}`,
        companyId: updated.companyId,
        currency: updated.currency,
        amountOriginal: updated.amountOriginal,
        merchantName: updated.merchantName,
        description: updated.description,
      });
      // 재게시 좌표로 덮어쓴다. 한쪽이 실패해 null이면 그 좌표는 지워져야 한다 —
      // 이미 삭제된 메시지를 가리키게 두면 다음 수정 때 없는 ts로 chat.delete를 부른다.
      await db
        .update(expenses)
        .set({
          slackMessageTs: posted.primary?.ts ?? null,
          slackChannelId: posted.primary?.channel ?? null,
          mirrorSlackMessageTs: posted.mirror?.ts ?? null,
          mirrorSlackChannelId: posted.mirror?.channel ?? null,
        })
        .where(eq(expenses.id, updated.id))
        .catch(() => {});
    } catch (err) {
      console.error("[Slack] 입금요청→법카 변경 재게시 실패:", err);
    }
  }

  return updated;
}
