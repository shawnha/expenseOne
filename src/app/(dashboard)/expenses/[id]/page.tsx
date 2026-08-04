import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Download,
  Undo2,
} from "lucide-react";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { getExpenseById } from "@/services/expense.service";
import { cn } from "@/lib/utils";
import {
  formatAmount,
  formatFileSize,
  DOCUMENT_TYPE_OPTIONS,
} from "@/lib/validations/expense-form";
import { getCategoryLabel, formatExpenseAmount } from "@/lib/utils/expense-utils";

import { BackToListButton } from "@/components/expenses/back-to-list-button";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { CancelExpenseButton } from "@/components/expenses/cancel-expense-button";
import { RequestRemainingButton } from "@/components/expenses/request-remaining-button";
import { ApproveRemainingButton } from "@/components/expenses/approve-remaining-button";
import { AdminApproveReject } from "@/components/expenses/admin-approve-reject";
import { RevertApprovalButton } from "@/components/expenses/revert-approval-button";
import { AdminQuickEditButton } from "@/components/expenses/admin-quick-edit-button";
import { PrePaidBadge } from "@/components/expenses/pre-paid-badge";
import type {
  ExpenseType,
  ExpenseStatus,
  DocumentType,
} from "@/types";

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<ExpenseType, { label: string; className: string }> = {
  CORPORATE_CARD: {
    label: "법카사용",
    className: "glass-badge glass-badge-blue",
  },
  DEPOSIT_REQUEST: {
    label: "입금요청",
    className: "glass-badge glass-badge-orange",
  },
  REFUND: {
    label: "반품",
    className: "glass-badge glass-badge-red",
  },
};

const STATUS_LABELS: Record<ExpenseStatus, { label: string; className: string }> = {
  SUBMITTED: {
    label: "제출",
    className: "glass-badge glass-badge-blue",
  },
  APPROVED: {
    label: "승인",
    className: "glass-badge glass-badge-green",
  },
  REJECTED: {
    label: "반려",
    className: "glass-badge glass-badge-red",
  },
  CANCELLED: {
    label: "취소",
    className: "glass-badge glass-badge-gray",
  },
};

function getDocTypeLabel(docType: DocumentType): string {
  return DOCUMENT_TYPE_OPTIONS.find((d) => d.value === docType)?.label ?? docType;
}

function formatDateKR(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function formatDateTimeKR(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}.${month}.${day} ${hours}:${minutes}`;
}

// ---------------------------------------------------------------------------
// Data fetching — uses Drizzle-based service layer (getExpenseById)
// ---------------------------------------------------------------------------

async function getExpenseDetail(id: string) {
  const user = await getCachedCurrentUser();
  if (!user) {
    redirect("/login");
  }

  try {
    const result = await getExpenseById(id, user.id, user.role);

    return {
      expense: {
        id: result.id,
        type: result.type as ExpenseType,
        status: result.status as ExpenseStatus,
        title: result.title,
        description: result.description,
        amount: result.amount,
        currency: result.currency ?? null,
        amountOriginal: result.amountOriginal ?? null,
        exchangeRate: result.exchangeRate ?? null,
        category: result.category,
        merchantName: result.merchantName,
        transactionDate: result.transactionDate,
        cardLastFour: result.cardLastFour,
        bankName: result.bankName,
        accountHolder: result.accountHolder,
        accountNumber: result.accountNumber,
        isUrgent: result.isUrgent ?? false,
        isPrePaid: result.isPrePaid ?? false,
        prePaidPercentage: result.prePaidPercentage ?? null,
        dueDate: result.dueDate ?? null,
        remainingPaymentRequested: result.remainingPaymentRequested ?? false,
        remainingPaymentApproved: result.remainingPaymentApproved ?? false,
        rejectionReason: result.rejectionReason,
        submittedById: result.submittedById,
        approvedById: result.approvedById,
        approvedAt: result.approvedAt?.toISOString() ?? null,
        createdAt: result.createdAt?.toISOString() ?? null,
        updatedAt: result.updatedAt?.toISOString() ?? null,
        companyId: result.companyId ?? null,
        submitter: result.submitter,
        originalExpenseId: result.originalExpenseId ?? null,
      },
      originalExpense: result.originalExpense,
      refunds: result.refunds,
      attachments: (result.attachments ?? []).map((a) => ({
        id: a.id,
        documentType: a.documentType as DocumentType,
        fileName: a.fileName,
        fileKey: a.fileKey,
        fileUrl: a.fileUrl,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
      })),
      currentUserId: user.id,
      userRole: user.role,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

interface ExpenseDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ExpenseDetailPage({ params }: ExpenseDetailPageProps) {
  const { id } = await params;
  const result = await getExpenseDetail(id);

  if (!result) {
    notFound();
  }

  const { expense, attachments, currentUserId, userRole, originalExpense, refunds } = result;
  const typeInfo = TYPE_LABELS[expense.type];
  const statusInfo = STATUS_LABELS[expense.status];
  const isOwner = currentUserId === expense.submittedById;
  const isCorporateCard = expense.type === "CORPORATE_CARD";
  const isDepositRequest = expense.type === "DEPOSIT_REQUEST";
  const isRefund = expense.type === "REFUND";

  // 환불 가능 잔액 (원거래 통화 기준) — '반품 등록' 버튼 노출 여부에 사용
  const isUSD = expense.currency === "USD";
  const refundedTotal = refunds.reduce(
    (acc, r) => acc + (isUSD ? (r.amountOriginal ?? 0) : r.amount),
    0,
  );
  const refundableRemaining =
    (isUSD ? (expense.amountOriginal ?? 0) : expense.amount) - refundedTotal;

  const canEdit = (() => {
    if (!isOwner) return false;
    if (isCorporateCard) {
      return expense.status === "APPROVED" || expense.status === "SUBMITTED";
    }
    if (isDepositRequest) {
      return expense.status === "SUBMITTED" || expense.status === "APPROVED";
    }
    return false;
  })();

  const canCancel = isOwner && !isRefund && (expense.status === "SUBMITTED" || expense.status === "APPROVED");
  const isAdmin = userRole === "ADMIN";
  const canApproveReject = isAdmin && !isOwner && expense.type === "DEPOSIT_REQUEST" && expense.status === "SUBMITTED";
  const canRevertApproval = isAdmin && !isOwner && isDepositRequest && expense.status === "APPROVED";
  // 반품 등록: 승인된 원거래(비반품)이고 환불 가능 잔액이 남아 있을 때
  const canRefund =
    !isRefund &&
    expense.status === "APPROVED" &&
    (isOwner || isAdmin) &&
    refundableRemaining > 0;

  // 부분 선지급 건의 금액 표시.
  // 상단에 총액만 크게 띄우면 실제 송금 담당자가 얼마를 보내야 하는지 헷갈린다
  // (50% 선지급인데 총액 509,080원만 보고 전액 송금할 위험). 그래서 히어로에는
  // "지금 보내야 할 금액"을 두고 총액은 바로 아래 캡션으로 내린다.
  const isPartialPrePaid =
    isDepositRequest &&
    expense.isPrePaid &&
    expense.prePaidPercentage != null &&
    expense.prePaidPercentage < 100;
  const prePaidAmount = isPartialPrePaid
    ? Math.round((expense.amount * expense.prePaidPercentage!) / 100)
    : 0;
  const remainingAmount = isPartialPrePaid ? expense.amount - prePaidAmount : 0;

  // 단계별로 히어로에 들어갈 금액이 바뀐다. 그러지 않으면 후지급 차례에서
  // 똑같은 혼란(총액을 보고 전액 송금)이 반복된다.
  let heroLabel = isRefund ? "환불 금액" : "금액";
  let heroAmount = expense.amount;
  // USD 건(HOI)은 "$X (₩Y)"로 표시되므로 원화만 쪼개면 원문 금액과 어긋난다.
  // 히어로가 부분 금액일 때는 원문 금액도 같은 비율로 쪼갠다.
  let heroAmountOriginal = expense.amountOriginal;
  let heroCaption: string | null = null;
  if (isPartialPrePaid) {
    const pct = expense.prePaidPercentage!;
    // amountOriginal은 센트 정수라 원화와 똑같이 반올림 후 차감해야 합이 맞는다.
    const prePaidOriginal =
      expense.amountOriginal != null
        ? Math.round((expense.amountOriginal * pct) / 100)
        : null;
    const remainingOriginal =
      expense.amountOriginal != null && prePaidOriginal != null
        ? expense.amountOriginal - prePaidOriginal
        : null;
    if (expense.remainingPaymentApproved) {
      // 전액 지급이 끝난 뒤에는 총액이 다시 기준 금액이 된다.
      heroLabel = "총 금액 (지급 완료)";
      heroCaption = `선지급 ${formatAmount(prePaidAmount)}원 + 후지급 ${formatAmount(remainingAmount)}원`;
    } else if (expense.remainingPaymentRequested) {
      heroLabel = `후지급 금액 (${100 - pct}%)`;
      heroAmount = remainingAmount;
      heroAmountOriginal = remainingOriginal;
      heroCaption = `총 ${formatAmount(expense.amount)}원 · 선지급 ${formatAmount(prePaidAmount)}원 지급 완료`;
    } else {
      heroLabel = `선지급 금액 (${pct}%)`;
      heroAmount = prePaidAmount;
      heroAmountOriginal = prePaidOriginal;
      heroCaption = `총 ${formatAmount(expense.amount)}원 · 후지급 ${formatAmount(remainingAmount)}원 예정`;
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      {/* Breadcrumb (desktop) */}
      <div className="animate-fade-up">
        <Breadcrumb items={[
          { label: "비용 관리", href: "/expenses" },
          { label: expense.title },
        ]} />
        <div className="mt-2 sm:mt-0">
          <BackToListButton />
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between animate-fade-up-1">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={cn(typeInfo.className, "animate-spring-pop")}>{typeInfo.label}</span>
            <span className={cn(statusInfo.className, "animate-spring-pop")}>{statusInfo.label}</span>
            {expense.isUrgent && (
              <span className={cn("glass-badge glass-badge-red", "animate-spring-pop")}>긴급</span>
            )}
            <PrePaidBadge
              isPrePaid={expense.isPrePaid}
              percentage={expense.prePaidPercentage}
              className="animate-spring-pop"
            />
            {/* 부분 선지급 건은 '승인'만으로는 후지급 완료 여부를 알 수 없어 별도 배지로 표시.
                목록(ExpenseTable)과 같은 3단계·같은 색을 쓴다 — 요청 전 회색(할 일 없음),
                요청됨 주황(승인 필요), 완료 초록. */}
            {isPartialPrePaid &&
              expense.status === "APPROVED" &&
              (expense.remainingPaymentApproved ? (
                <span className={cn("glass-badge glass-badge-green", "animate-spring-pop")}>후지급 완료</span>
              ) : expense.remainingPaymentRequested ? (
                <span className={cn("glass-badge glass-badge-orange", "animate-spring-pop")}>후지급 요청</span>
              ) : (
                <span className={cn("glass-badge glass-badge-gray", "animate-spring-pop")}>후지급 대기</span>
              ))}
          </div>
          <h1 className="text-title3 text-[var(--apple-label)]">{expense.title}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <AdminQuickEditButton
              expense={{
                id: expense.id,
              }}
            />
          )}
          {canEdit && !isAdmin && (
            <Link
              href={`/expenses/${id}/edit`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full glass text-sm font-medium text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)] transition-colors apple-press"
            >
              수정
            </Link>
          )}
          {canRefund && (
            <Link
              href={`/expenses/new/refund?originalId=${id}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full glass text-sm font-medium text-[var(--apple-red)] hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)] transition-colors apple-press"
            >
              <Undo2 className="size-4" />
              반품 등록
            </Link>
          )}
          {canCancel && <CancelExpenseButton expenseId={id} />}
          {canApproveReject && (
            <AdminApproveReject
              expenseId={id}
              expenseTitle={expense.title}
              expenseAmount={expense.amount}
              expenseCurrency={expense.currency}
              expenseAmountOriginal={expense.amountOriginal}
              isPrePaid={expense.isPrePaid}
              prePaidPercentage={expense.prePaidPercentage}
            />
          )}
          {canRevertApproval && (
            <RevertApprovalButton expenseId={id} expenseTitle={expense.title} />
          )}
        </div>
      </div>

      {/* Rejection reason */}
      {expense.status === "REJECTED" && expense.rejectionReason && (
        <div className="glass p-4 border-l-4 border-l-[#FF3B30] animate-fade-up-2">
          <p className="text-footnote font-semibold text-[var(--apple-red)] mb-1">반려 사유</p>
          <p className="text-sm text-[var(--apple-label)]">{expense.rejectionReason}</p>
        </div>
      )}

      {/* Expense info */}
      <div className="glass p-6 animate-card-enter stagger-1">
        <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-4">비용 정보</h2>

        {/* Amount */}
        <div className="mb-5 p-4 rounded-xl bg-[rgba(0,0,0,0.04)] dark:bg-[rgba(255,255,255,0.06)]">
          <span className="text-[13px] text-[var(--apple-secondary-label)]">{heroLabel}</span>
          <p className={`text-xl sm:text-2xl font-semibold tabular-nums ${isRefund ? "text-[var(--apple-red)]" : "text-[var(--apple-label)]"}`}>
            {isRefund && "-"}
            {formatExpenseAmount(heroAmount, expense.currency, heroAmountOriginal)}
          </p>
          {heroCaption && (
            <p className="text-[12px] text-[var(--apple-secondary-label)] mt-1 tabular-nums">
              {heroCaption}
            </p>
          )}
          {expense.currency === "USD" && expense.exchangeRate && (
            <p className="text-[12px] text-[var(--apple-tertiary-label)] mt-1">적용 환율: 1 USD = {Number(expense.exchangeRate).toLocaleString("ko-KR")}원</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <InfoRow label="카테고리" value={getCategoryLabel(expense.category)} />
          <InfoRow label="거래일" value={formatDateKR(expense.transactionDate)} />
          <InfoRow label="제출자" value={expense.submitter?.name ?? "-"} />
          <InfoRow label="제출일" value={formatDateTimeKR(expense.createdAt)} />
        </div>

        {expense.description && (
          <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)]">
            <span className="text-[13px] text-[var(--apple-secondary-label)]">설명</span>
            <p className="text-sm mt-1 whitespace-pre-wrap text-[var(--apple-label)]">{expense.description}</p>
          </div>
        )}

        {/* Corporate card fields */}
        {isCorporateCard && (expense.merchantName || expense.cardLastFour) && (
          <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)] grid gap-4 sm:grid-cols-2">
            {expense.merchantName && (
              <InfoRow label="가맹점명" value={expense.merchantName} />
            )}
            {expense.cardLastFour && (
              <InfoRow label="카드 끝 4자리" value={`****-${expense.cardLastFour}`} />
            )}
          </div>
        )}

        {/* Deposit request fields */}
        {isDepositRequest && (
          <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)] grid gap-4 sm:grid-cols-2">
            {expense.bankName && <InfoRow label="은행명" value={expense.bankName} />}
            {expense.accountHolder && <InfoRow label="예금주" value={expense.accountHolder} />}
            {expense.accountNumber && <InfoRow label="계좌번호" value={expense.accountNumber} />}
            {expense.dueDate && (
              <InfoRow label="납입 기일" value={formatDateKR(expense.dueDate)} />
            )}
            {expense.isUrgent && (
              <InfoRow label="긴급" value="Y" />
            )}
            {expense.isPrePaid && (
              <InfoRow label="선지급" value={expense.prePaidPercentage != null ? `${expense.prePaidPercentage}%` : "Y"} />
            )}
          </div>
        )}

        {/* Prepayment breakdown */}
        {isPartialPrePaid && (
            <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)]">
              <h3 className="text-footnote font-semibold text-[var(--apple-label)] mb-3">선지급 내역</h3>
              {/* 회차별 지급 상태를 같이 적는다. 금액만 있으면 "이미 보낸 돈인지
                  지금 보낼 돈인지"를 상세 화면만 보고 판단할 수 없다. */}
              <div className="px-3 py-2.5 text-[13px] text-[var(--apple-secondary-label)] space-y-1 border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)] rounded-xl">
                <div className="flex justify-between gap-3">
                  <span>총 금액</span>
                  <span className="font-medium text-[var(--apple-label)] tabular-nums">{formatAmount(expense.amount)}원</span>
                </div>
                <div className="flex justify-between gap-3 text-[var(--apple-blue)]">
                  <span>
                    선지급금 ({expense.prePaidPercentage}%)
                    <span className="ml-1.5 text-[var(--apple-tertiary-label)]">
                      {expense.status === "APPROVED" ? "지급완료" : "승인 대기"}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">{formatAmount(prePaidAmount)}원</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>
                    후지급금 ({100 - expense.prePaidPercentage!}%)
                    <span className="ml-1.5 text-[var(--apple-tertiary-label)]">
                      {expense.remainingPaymentApproved
                        ? "지급완료"
                        : expense.remainingPaymentRequested
                          ? "승인 대기"
                          : "요청 전"}
                    </span>
                  </span>
                  <span className="font-medium text-[var(--apple-label)] tabular-nums">{formatAmount(remainingAmount)}원</span>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                {expense.remainingPaymentApproved ? (
                  <span className="glass-badge glass-badge-green">후지급 승인완료</span>
                ) : expense.remainingPaymentRequested ? (
                  <>
                    {userRole === "ADMIN" ? (
                      <ApproveRemainingButton expenseId={expense.id} />
                    ) : isOwner ? (
                      <span className="text-sm text-[var(--apple-secondary-label)]">후지급 요청됨 - 승인 대기 중</span>
                    ) : (
                      <span className="glass-badge glass-badge-orange">후지급 요청됨</span>
                    )}
                  </>
                ) : (
                  isOwner && expense.status === "APPROVED" && (
                    <RequestRemainingButton expenseId={expense.id} />
                  )
                )}
              </div>
            </div>
        )}
        {/* 반품 건 → 원거래 링크 */}
        {isRefund && originalExpense && (
          <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)]">
            <span className="text-[13px] text-[var(--apple-secondary-label)]">원거래</span>
            <Link
              href={`/expenses/${originalExpense.id}`}
              className="mt-1 flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)] hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)] transition-colors apple-press"
            >
              <span className="text-sm text-[var(--apple-label)] truncate">{originalExpense.title}</span>
              <span className="text-sm font-medium tabular-nums text-[var(--apple-label)] shrink-0">
                {formatAmount(originalExpense.amount)}원
              </span>
            </Link>
          </div>
        )}

        {/* 원거래 → 연결된 반품 내역 */}
        {!isRefund && refunds.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)]">
            <h3 className="text-footnote font-semibold text-[var(--apple-label)] mb-2">반품 내역</h3>
            <div className="flex flex-col gap-1.5">
              {refunds.map((r) => (
                <Link
                  key={r.id}
                  href={`/expenses/${r.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)] hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)] transition-colors apple-press"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] text-[var(--apple-secondary-label)] tabular-nums shrink-0">
                      {formatDateKR(r.transactionDate)}
                    </span>
                    <span className="text-sm text-[var(--apple-label)] truncate">{r.title}</span>
                  </span>
                  <span className="text-sm font-medium tabular-nums text-[var(--apple-red)] shrink-0">
                    -{formatExpenseAmount(r.amount, r.currency, r.amountOriginal)}
                  </span>
                </Link>
              ))}
              <div className="flex items-center justify-between px-3 py-1.5 text-[13px] text-[var(--apple-secondary-label)]">
                <span>환불 후 잔액</span>
                <span className="font-medium tabular-nums text-[var(--apple-label)]">
                  {isUSD
                    ? `$${(refundableRemaining / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                    : `${formatAmount(refundableRemaining)}원`}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status timeline */}
      <div className="glass p-6 animate-card-enter stagger-2">
        <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-4">상태</h2>
        <div className="flex flex-col gap-0">
          <TimelineItem
            label="제출"
            date={formatDateTimeKR(expense.createdAt)}
            description={`${expense.submitter?.name ?? "사용자"}님이 제출`}
            active
            isLast={expense.status === "SUBMITTED"}
          />
          {expense.status === "APPROVED" && (
            <TimelineItem
              label="승인"
              date={formatDateTimeKR(expense.approvedAt)}
              description={isCorporateCard || isRefund ? "자동 승인" : "관리자 승인"}
              active
              variant="success"
              isLast
            />
          )}
          {expense.status === "REJECTED" && (
            <TimelineItem
              label="반려"
              date={formatDateTimeKR(expense.updatedAt)}
              description={expense.rejectionReason ?? "반려됨"}
              active
              variant="destructive"
              isLast
            />
          )}
          {expense.status === "CANCELLED" && (
            <TimelineItem
              label="취소"
              date={formatDateTimeKR(expense.updatedAt)}
              description="제출자가 취소"
              active
              variant="muted"
              isLast
            />
          )}
          {expense.status === "SUBMITTED" && (
            <TimelineItem
              label="승인 대기"
              date=""
              description="관리자 승인을 기다리고 있습니다"
              active={false}
              isLast
            />
          )}
        </div>
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="glass p-6 animate-card-enter stagger-3">
          <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-4">
            첨부파일 ({attachments.length})
          </h2>
          <div className="space-y-3">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-[rgba(0,0,0,0.04)] dark:bg-[rgba(255,255,255,0.06)]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--apple-label)] truncate">{attachment.fileName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="glass-badge glass-badge-gray">
                      {getDocTypeLabel(attachment.documentType)}
                    </span>
                    <span className="text-[11px] text-[var(--apple-secondary-label)]">
                      {formatFileSize(attachment.fileSize)}
                    </span>
                  </div>
                </div>
                <a
                  href={`/api/attachments/${attachment.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-[var(--apple-blue)] hover:text-[color-mix(in_srgb,var(--apple-blue)_85%,black)] transition-colors font-medium apple-press"
                  aria-label={`${attachment.fileName} 다운로드`}
                >
                  <Download className="size-3.5" />
                  다운로드
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] text-[var(--apple-secondary-label)]">{label}</span>
      <span className="text-sm font-medium text-[var(--apple-label)]">{value}</span>
    </div>
  );
}

function TimelineItem({
  label,
  date,
  description,
  active,
  variant = "default",
  isLast = false,
}: {
  label: string;
  date: string;
  description: string;
  active: boolean;
  variant?: "default" | "success" | "destructive" | "muted";
  isLast?: boolean;
}) {
  const dotColors = {
    default: "bg-[var(--apple-blue)]",
    success: "bg-[var(--apple-green)]",
    destructive: "bg-[var(--apple-red)]",
    muted: "bg-[#8e8e93]",
  };

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "size-3 rounded-full mt-1 shrink-0",
            active ? dotColors[variant] : "border-2 border-[#d1d1d6] bg-[var(--apple-secondary-system-background)]"
          )}
        />
        {!isLast && <div className="w-px flex-1 bg-[rgba(0,0,0,0.08)] dark:bg-[rgba(255,255,255,0.1)] min-h-4" />}
      </div>
      <div className="pb-4">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", active ? "text-[var(--apple-label)]" : "text-[var(--apple-secondary-label)]")}>
            {label}
          </span>
          {date && (
            <span className="text-[12px] text-[var(--apple-secondary-label)]">{date}</span>
          )}
        </div>
        <p className={cn("text-[13px] mt-0.5", active ? "text-[var(--apple-secondary-label)]" : "text-[#c7c7cc]")}>
          {description}
        </p>
      </div>
    </div>
  );
}
