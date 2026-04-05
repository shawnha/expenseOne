import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Download,
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
import { AdminQuickEditButton } from "@/components/expenses/admin-quick-edit-button";
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
      },
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

  const { expense, attachments, currentUserId, userRole } = result;
  const typeInfo = TYPE_LABELS[expense.type];
  const statusInfo = STATUS_LABELS[expense.status];
  const isOwner = currentUserId === expense.submittedById;
  const isCorporateCard = expense.type === "CORPORATE_CARD";
  const isDepositRequest = expense.type === "DEPOSIT_REQUEST";

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

  const canCancel = isOwner && (expense.status === "SUBMITTED" || expense.status === "APPROVED");
  const isAdmin = userRole === "ADMIN";
  const canApproveReject = isAdmin && !isOwner && expense.type === "DEPOSIT_REQUEST" && expense.status === "SUBMITTED";

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
          </div>
          <h1 className="text-title3 text-[var(--apple-label)]">{expense.title}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <AdminQuickEditButton
              expense={{
                id: expense.id,
                title: expense.title,
                category: expense.category,
                amount: expense.amount,
                status: expense.status,
                type: expense.type,
                createdAt: expense.createdAt ?? "",
                companyId: expense.companyId,
                submitter: expense.submitter ? { name: expense.submitter.name } : null,
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
          {canCancel && <CancelExpenseButton expenseId={id} />}
          {canApproveReject && (
            <AdminApproveReject
              expenseId={id}
              expenseTitle={expense.title}
              expenseAmount={expense.amount}
              expenseCurrency={expense.currency}
              expenseAmountOriginal={expense.amountOriginal}
            />
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
          <span className="text-[13px] text-[var(--apple-secondary-label)]">금액</span>
          <p className="text-xl sm:text-2xl font-semibold tabular-nums text-[var(--apple-label)]">{formatExpenseAmount(expense.amount, expense.currency, expense.amountOriginal)}</p>
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
            {expense.isUrgent && (
              <InfoRow label="긴급" value="Y" />
            )}
            {expense.isPrePaid && (
              <InfoRow label="선지급" value={expense.prePaidPercentage != null ? `${expense.prePaidPercentage}%` : "Y"} />
            )}
          </div>
        )}

        {/* Prepayment breakdown */}
        {isDepositRequest && expense.isPrePaid && expense.prePaidPercentage != null && expense.prePaidPercentage < 100 && (() => {
          const prePaidAmount = Math.round(expense.amount * expense.prePaidPercentage / 100);
          const remainingAmount = expense.amount - prePaidAmount;
          return (
            <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)]">
              <h3 className="text-footnote font-semibold text-[var(--apple-label)] mb-3">선지급 내역</h3>
              <div className="px-3 py-2.5 text-[13px] text-[var(--apple-secondary-label)] space-y-1 border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)] rounded-xl">
                <div className="flex justify-between">
                  <span>총 금액</span>
                  <span className="font-medium text-[var(--apple-label)]">{formatAmount(expense.amount)}원</span>
                </div>
                <div className="flex justify-between text-[var(--apple-blue)]">
                  <span>선지급금 ({expense.prePaidPercentage}%)</span>
                  <span className="font-medium">{formatAmount(prePaidAmount)}원</span>
                </div>
                <div className="flex justify-between">
                  <span>후지급금 ({100 - expense.prePaidPercentage}%)</span>
                  <span className="font-medium text-[var(--apple-label)]">{formatAmount(remainingAmount)}원</span>
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
                      <span className="glass-badge glass-badge-green">후지급 요청됨</span>
                    )}
                  </>
                ) : (
                  isOwner && expense.status === "APPROVED" && (
                    <RequestRemainingButton expenseId={expense.id} />
                  )
                )}
              </div>
            </div>
          );
        })()}
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
              description={isCorporateCard ? "자동 승인" : "관리자 승인"}
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
