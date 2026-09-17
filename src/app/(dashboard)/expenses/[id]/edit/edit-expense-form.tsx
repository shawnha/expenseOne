"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import {
  CalendarIcon,
  ArrowLeft,
  Loader2,
  X,
  FileText,
  ImageIcon,
  Download,
  Lock,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

import { FileUpload, FileUploadWithDocType } from "@/components/forms/file-upload";
import { CompanySelector } from "@/components/forms/company-selector";
import { CategorySelectField } from "@/components/forms/category-select-field";
import {
  corporateCardFormSchema,
  depositRequestFormSchema,
  type CorporateCardFormData,
  type DepositRequestFormData,
  type FileWithPreview,
  DOCUMENT_TYPE_OPTIONS,
  formatAmount,
  formatDateISO,
  formatFileSize,
} from "@/lib/validations/expense-form";
import { formatExpenseAmount } from "@/lib/utils/expense-utils";
import type { DocumentType } from "@/types";
import type { ExpenseEditData, ExistingAttachment, CompanyOption } from "./page";
import { cn } from "@/lib/utils";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useFormBusy } from "@/hooks/use-form-busy";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EditExpenseFormProps {
  expense: ExpenseEditData;
  existingAttachments: ExistingAttachment[];
  initialCompanies: CompanyOption[];
  /** 본인이 예전에 직접 입력한 카테고리 (최근순). */
  myCategories?: string[];
  /** 보는 사람이 ADMIN인가. 서버 잠금은 ADMIN에게 걸리지 않으므로 화면도 맞춘다. */
  viewerIsAdmin?: boolean;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function EditExpenseForm({
  expense,
  existingAttachments,
  initialCompanies,
  myCategories = [],
  viewerIsAdmin = false,
}: EditExpenseFormProps) {
  if (expense.type === "CORPORATE_CARD") {
    return (
      <CorporateCardEditForm
        expense={expense}
        existingAttachments={existingAttachments}
        initialCompanies={initialCompanies}
        myCategories={myCategories}
      />
    );
  }

  return (
    <DepositRequestEditForm
      expense={expense}
      existingAttachments={existingAttachments}
      initialCompanies={initialCompanies}
      myCategories={myCategories}
      viewerIsAdmin={viewerIsAdmin}
    />
  );
}

// ---------------------------------------------------------------------------
// Existing Attachment Item
// ---------------------------------------------------------------------------

function ExistingAttachmentItem({
  attachment,
  onRemove,
}: {
  attachment: ExistingAttachment;
  onRemove: () => void;
}) {
  const isImage = attachment.mimeType.startsWith("image/");

  const docTypeLabel =
    DOCUMENT_TYPE_OPTIONS.find((d) => d.value === attachment.documentType)
      ?.label ?? attachment.documentType;

  return (
    <div className="flex items-center gap-3 rounded-xl p-3 bg-[rgba(0,0,0,0.04)] dark:bg-[rgba(255,255,255,0.06)]">
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[rgba(0,0,0,0.03)] dark:bg-[rgba(255,255,255,0.05)]">
        {isImage ? (
          <ImageIcon className="size-6 text-[var(--apple-secondary-label)]" />
        ) : (
          <FileText className="size-6 text-[var(--apple-red)]" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-medium text-[var(--apple-label)]">{attachment.fileName}</p>
        <div className="flex items-center gap-2">
          <span className="glass-badge glass-badge-gray">
            {docTypeLabel}
          </span>
          <span className="text-[11px] text-[var(--apple-secondary-label)]">
            {formatFileSize(attachment.fileSize)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* target="_blank" 없음 — 응답이 Content-Disposition: attachment라
            페이지 이동 없이 다운로드만 시작된다(빈 탭이 깜빡이지 않음). */}
        <a
          href={`/api/attachments/${attachment.id}/download`}
          aria-label={`${attachment.fileName} 다운로드`}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="shrink-0 text-[var(--apple-blue)] hover:text-[color-mix(in_srgb,var(--apple-blue)_85%,black)]"
          >
            <Download className="size-4" />
          </Button>
        </a>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          aria-label={`${attachment.fileName} 삭제`}
          className="shrink-0 text-[var(--apple-secondary-label)] hover:text-[var(--apple-red)]"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Corporate Card Edit Form
// ---------------------------------------------------------------------------

function CorporateCardEditForm({
  expense,
  existingAttachments,
  initialCompanies,
  myCategories = [],
}: EditExpenseFormProps) {
  const router = useRouter();
  const [newFiles, setNewFiles] = useState<FileWithPreview[]>([]);
  const [keptAttachments, setKeptAttachments] =
    useState<ExistingAttachment[]>(existingAttachments);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amountDisplay, setAmountDisplay] = useState(
    formatAmount(expense.amount)
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string>(expense.companyId ?? "");
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const cid = json?.data?.companyId;
        if (!cancelled && cid) setUserCompanyId(cid);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCompanyChange = useCallback((newCompanyId: string, _currency?: string) => {
    void _currency;
    setCompanyId(newCompanyId);
  }, []);

  const transactionDate = expense.transactionDate
    ? new Date(expense.transactionDate + "T00:00:00")
    : undefined;

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isDirty },
  } = useForm<CorporateCardFormData>({
    resolver: zodResolver(corporateCardFormSchema),
    shouldFocusError: true,
    defaultValues: {
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
      merchantName: expense.merchantName ?? "",
      transactionDate,
      description: expense.description ?? "",
    },
  });

  // Warn on unsaved changes (browser close / refresh)
  const companyChanged = companyId !== (expense.companyId ?? "");
  useUnsavedChanges(isDirty || newFiles.length > 0 || removedAttachmentIds.length > 0 || companyChanged);
  // 작성·제출 중엔 새 배포의 강제 새로고침을 미룬다 (sw-update-prompt)
  useFormBusy("expense-edit-card", isDirty || newFiles.length > 0 || removedAttachmentIds.length > 0 || companyChanged || isSubmitting);

  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^\d]/g, "");
      if (raw === "") {
        setAmountDisplay("");
        setValue("amount", 0, { shouldValidate: true });
        return;
      }
      const num = parseInt(raw, 10);
      setAmountDisplay(formatAmount(num));
      setValue("amount", num, { shouldValidate: true });
    },
    [setValue]
  );

  const removeExistingAttachment = useCallback((id: string) => {
    setKeptAttachments((prev) => prev.filter((a) => a.id !== id));
    setRemovedAttachmentIds((prev) => [...prev, id]);
  }, []);

  const onValidationError = (fieldErrors: Record<string, unknown>) => {
    const fieldNames: Record<string, string> = {
      title: "제목",
      amount: "금액",
      category: "카테고리",
      merchantName: "가맹점명",
      description: "설명",
    };
    const firstKey = Object.keys(fieldErrors)[0];
    const err = fieldErrors[firstKey] as { message?: string } | undefined;
    toast.error(`${fieldNames[firstKey] || firstKey}: ${err?.message || "입력 오류"}`);
  };

  const onSubmit = async (data: CorporateCardFormData) => {
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/expenses/${expense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          description: data.description || null,
          amount: data.amount,
          category: data.category,
          merchantName: data.merchantName || undefined,
          transactionDate: formatDateISO(data.transactionDate ?? new Date()),
          companyId: companyId || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error?.message || "비용 수정에 실패했습니다."
        );
      }

      // Delete removed attachments in parallel
      if (removedAttachmentIds.length > 0) {
        await Promise.allSettled(
          removedAttachmentIds.map((attachmentId) =>
            fetch(`/api/attachments/${attachmentId}`, { method: "DELETE" }),
          ),
        );
      }

      // Upload new attachments in parallel
      if (newFiles.length > 0) {
        const uploadResults = await Promise.allSettled(
          newFiles.map((fileItem) => {
            const formData = new FormData();
            formData.append("file", fileItem.file);
            formData.append("expenseId", expense.id);
            formData.append("documentType", fileItem.documentType || "OTHER");
            return fetch("/api/attachments/upload", { method: "POST", body: formData })
              .then((res) => { if (!res.ok) throw new Error(fileItem.file.name); return res; });
          }),
        );
        const failed = uploadResults.filter((r) => r.status === "rejected");
        if (failed.length > 0) {
          if (failed.length === newFiles.length) {
            toast.error("파일 업로드에 실패했습니다. 비용 상세에서 다시 첨부해주세요.");
          } else {
            toast.error(`${newFiles.length}개 파일 중 ${failed.length}개 업로드 실패. 비용 상세에서 다시 첨부해주세요.`);
          }
        }
      }

      toast.success("비용이 수정되었습니다.");
      router.push(`/expenses/${expense.id}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "비용 수정에 실패했습니다."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/expenses/${expense.id}`} className="flex items-center justify-center size-8 rounded-full glass-subtle text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">법카사용 내역 수정</h1>
          <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">
            법인카드 사용내역을 수정합니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onValidationError)} noValidate>
        <div className="glass p-6">
          <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-1">기본 정보</h2>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mb-5">
            <span className="text-[var(--apple-red)]">*</span> 필수 항목
          </p>
          <div className="space-y-5">
            <CompanySelector
              value={companyId}
              onChange={handleCompanyChange}
              userCompanyId={userCompanyId}
              initialCompanies={initialCompanies}
            />
            <div className="space-y-1.5">
              <Label htmlFor="title">제목 <span className="text-[var(--apple-red)]">*</span></Label>
              <Input id="title" placeholder="예: 3월 사무용품 구매" aria-invalid={!!errors.title} {...register("title")} />
              {errors.title && <p className="text-xs text-[var(--apple-red)]">{errors.title.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">금액 <span className="text-[var(--apple-red)]">*</span></Label>
              <InputGroup>
                <InputGroupInput id="amount" placeholder="0" inputMode="numeric" value={amountDisplay} onChange={handleAmountChange} aria-invalid={!!errors.amount} />
                <InputGroupAddon align="inline-end"><InputGroupText>원</InputGroupText></InputGroupAddon>
              </InputGroup>
              {errors.amount && <p className="text-xs text-[var(--apple-red)]">{errors.amount.message}</p>}
            </div>
            {/* 카테고리 — 프리셋 + 내가 쓰던 것 + 직접 입력 */}
            <Controller name="category" control={control} render={({ field }) => (
              <CategorySelectField
                value={field.value ?? ""}
                onChange={field.onChange}
                myCategories={myCategories}
                error={errors.category?.message}
              />
            )} />
            <div className="space-y-1.5">
              <Label htmlFor="merchantName">가맹점명</Label>
              <Input id="merchantName" placeholder="예: 교보문고" {...register("merchantName")} />
              {errors.merchantName && <p className="text-xs text-[var(--apple-red)]">{errors.merchantName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>거래일 <span className="text-[var(--apple-red)]">*</span></Label>
              <Controller name="transactionDate" control={control} render={({ field }) => (
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger className={cn("flex h-10 w-full items-center justify-start gap-2 rounded-xl border border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)] px-3 text-sm transition-colors hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]", !field.value && "text-[var(--apple-secondary-label)]", errors.transactionDate && "border-[var(--apple-red)] ring-2 ring-[rgba(255,59,48,0.2)]")} aria-invalid={!!errors.transactionDate}>
                    <CalendarIcon className="size-4 text-[var(--apple-secondary-label)]" />
                    {field.value ? format(field.value, "yyyy.MM.dd", { locale: ko }) : "날짜 선택"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={field.value} onSelect={(date) => { field.onChange(date); setCalendarOpen(false); }} disabled={(date) => date > new Date()} locale={ko} />
                  </PopoverContent>
                </Popover>
              )} />
              {errors.transactionDate && <p className="text-xs text-[var(--apple-red)]">{errors.transactionDate.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">설명</Label>
              <Textarea id="description" placeholder="추가 설명을 입력해주세요 (선택사항)" rows={3} {...register("description")} />
              {errors.description && <p className="text-xs text-[var(--apple-red)]">{errors.description.message}</p>}
            </div>
          </div>
        </div>

        {(keptAttachments.length > 0 || newFiles.length > 0) && (
          <div className="glass p-6 mt-4">
            <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-1">기존 첨부파일</h2>
            <p className="text-[13px] text-[var(--apple-secondary-label)] mb-4">삭제 버튼을 눌러 기존 파일을 제거할 수 있습니다.</p>
            {keptAttachments.length > 0 ? (
              <div className="space-y-2">{keptAttachments.map((attachment) => (<ExistingAttachmentItem key={attachment.id} attachment={attachment} onRemove={() => removeExistingAttachment(attachment.id)} />))}</div>
            ) : (
              <p className="text-sm text-[var(--apple-secondary-label)]">기존 첨부파일이 모두 삭제되었습니다.</p>
            )}
          </div>
        )}

        <div className="glass p-6 mt-4">
          <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-1">새 파일 첨부</h2>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mb-4">영수증 등 증빙자료를 추가로 첨부해주세요. (선택사항)</p>
          <FileUpload files={newFiles} onFilesChange={setNewFiles} />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link href={`/expenses/${expense.id}`} className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full rounded-full h-11 glass border-[var(--apple-separator)]">취소</Button>
          </Link>
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto rounded-full h-11 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)]">
            {isSubmitting ? (<><Loader2 className="size-4 animate-spin" />수정 중...</>) : "수정하기"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deposit Request Edit Form
// ---------------------------------------------------------------------------

/**
 * 승인된 입금요청 수정용 스키마.
 *
 * 승인 후엔 금액·계좌·회사·선지급·원천징수가 잠겨서(서버가 바뀐 값이면 403)
 * 입력칸 대신 읽기 전용 카드로 보여준다. 그런데 숨긴 필드가 원래 스키마의
 * 필수/범위 검사에 걸리면(예: 예전에 은행명 없이 등록된 건) 고칠 칸도 없이
 * 저장이 막힌다. 그래서 잠금 필드는 타입만 맞추고 값 검사는 푼다 — 어차피
 * PATCH 본문에 싣지 않는다. 타입이 DepositRequestFormData와 같아서 폼 제네릭을
 * 그대로 쓸 수 있다.
 */
const approvedDepositRequestFormSchema = depositRequestFormSchema.extend({
  amount: z.number(),
  bankName: z.string(),
  accountHolder: z.string(),
  accountNumber: z.string(),
  isPrePaid: z.boolean(),
  prePaidPercentage: z.number().nullish(),
});

/** 승인 모드 요약 카드 아래 안내. 서버 403 문구와 같은 방향으로 맞춘다. */
const APPROVED_LOCK_NOTICE =
  "승인된 입금요청은 금액·계좌·회사·선지급·원천징수를 바꿀 수 없습니다. 변경이 필요하면 관리자에게 승인 취소를 요청해주세요.";

/**
 * 승인된 입금요청의 잠금 필드 요약 카드.
 *
 * 입력칸을 disabled로만 두면 "왜 안 눌리지"가 되고, 아예 숨기면 무엇으로
 * 승인받았는지 확인할 길이 없다. 그래서 값은 읽기 전용으로 보여주고, 바꾸려면
 * 어떻게 해야 하는지를 바로 아래에 적는다.
 */
function ApprovedDepositLockedSummary({
  expense,
  companyName,
}: {
  expense: ExpenseEditData;
  companyName: string | null;
}) {
  // 선지급 비율이 없는 옛 건은 상세 화면과 같게 "예"로만 표시한다.
  const prePaidLabel = expense.isPrePaid
    ? expense.prePaidPercentage != null
      ? `${expense.prePaidPercentage}%`
      : "예"
    : "아니오";

  return (
    <div className="glass p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-subheadline font-semibold text-[var(--apple-label)]">승인된 요청 정보</h2>
        <span className="glass-badge glass-badge-green shrink-0">승인됨</span>
      </div>

      {/* 금액 — USD 건은 원문 통화와 원화 환산을 같이 보여준다 */}
      <div className="mb-4 rounded-xl bg-[rgba(0,0,0,0.04)] p-4 dark:bg-[rgba(255,255,255,0.06)]">
        <span className="text-[13px] text-[var(--apple-secondary-label)]">금액</span>
        <p className="text-xl font-semibold tabular-nums text-[var(--apple-label)] break-words">
          {formatExpenseAmount(expense.amount, expense.currency, expense.amountOriginal)}
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <LockedInfoRow label="회사" value={companyName ?? "-"} />
        <LockedInfoRow label="선지급" value={prePaidLabel} />
        <LockedInfoRow
          label="프리랜서 원천징수"
          value={expense.hasFreelancerWithholding ? "적용 (-3.3%)" : "미적용"}
        />
        {expense.isPurchase && <LockedInfoRow label="사입" value="사입 건" />}
        <LockedInfoRow label="은행명" value={expense.bankName || "-"} />
        <LockedInfoRow label="예금주" value={expense.accountHolder || "-"} />
        <LockedInfoRow label="계좌번호" value={expense.accountNumber || "-"} mono />
      </dl>

      <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-[rgba(0,122,255,0.2)] bg-[rgba(0,122,255,0.1)] p-4">
        <Lock className="mt-0.5 size-4 shrink-0 text-[var(--apple-blue)]" aria-hidden="true" />
        <p className="text-[13px] leading-relaxed text-[var(--apple-label)]">{APPROVED_LOCK_NOTICE}</p>
      </div>
    </div>
  );
}

function LockedInfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  /** 계좌번호처럼 숫자를 대조하는 값 — 고정폭 숫자 + 좁은 화면에서 아무 데서나 줄바꿈 */
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[13px] text-[var(--apple-secondary-label)]">{label}</dt>
      <dd className={cn("text-sm font-medium text-[var(--apple-label)]", mono ? "break-all tabular-nums" : "break-words")}>
        {value}
      </dd>
    </div>
  );
}

function DepositRequestEditForm({
  expense,
  existingAttachments,
  initialCompanies,
  myCategories = [],
  viewerIsAdmin = false,
}: EditExpenseFormProps) {
  const router = useRouter();
  // 승인된 요청 모드 — 영수증 보충·제목/카테고리/긴급/납입 기일/설명만 고친다.
  // 수정 화면 진입 시점의 상태 기준. 편집 중에 승인되면 서버가 잠금 필드
  // 변경을 403으로 막고, 그때 화면을 새로고침해 이 모드로 바꾼다.
  // ADMIN은 서버 잠금 대상이 아니므로 잠그지 않는다.
  const isApprovedMode = expense.status === "APPROVED" && !viewerIsAdmin;
  const [newFiles, setNewFiles] = useState<FileWithPreview[]>([]);
  const [keptAttachments, setKeptAttachments] =
    useState<ExistingAttachment[]>(existingAttachments);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amountDisplay, setAmountDisplay] = useState(
    formatAmount(expense.amount)
  );
  const [supplyAmount, setSupplyAmount] = useState(expense.amount);
  const [vatIncluded, setVatIncluded] = useState(false);
  const [freelancerDeduction, setFreelancerDeduction] = useState(
    expense.hasFreelancerWithholding ?? false
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [docTypeErrors, setDocTypeErrors] = useState<Record<string, boolean>>({});
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string>(expense.companyId ?? "");
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);

  useEffect(() => {
    // 승인 모드엔 회사 선택기가 없어서 기본 회사를 알 필요가 없다.
    if (isApprovedMode) return;
    let cancelled = false;
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const cid = json?.data?.companyId;
        if (!cancelled && cid) setUserCompanyId(cid);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isApprovedMode]);

  const handleCompanyChange = useCallback((newCompanyId: string, _currency?: string) => {
    void _currency;
    setCompanyId(newCompanyId);
  }, []);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<DepositRequestFormData>({
    resolver: isApprovedMode
      ? zodResolver(approvedDepositRequestFormSchema)
      : zodResolver(depositRequestFormSchema),
    shouldFocusError: true,
    defaultValues: {
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
      bankName: expense.bankName ?? "",
      accountHolder: expense.accountHolder ?? "",
      accountNumber: expense.accountNumber ?? "",
      isUrgent: expense.isUrgent ?? false,
      isPrePaid: expense.isPrePaid ?? false,
      prePaidPercentage: expense.prePaidPercentage ?? null,
      dueDate: expense.dueDate ? new Date(expense.dueDate + "T00:00:00") : null,
      description: expense.description ?? "",
    },
  });

  // Warn on unsaved changes (browser close / refresh)
  const companyChanged = companyId !== (expense.companyId ?? "");
  useUnsavedChanges(isDirty || newFiles.length > 0 || removedAttachmentIds.length > 0 || companyChanged);
  // 작성·제출 중엔 새 배포의 강제 새로고침을 미룬다 (sw-update-prompt)
  useFormBusy("expense-edit-deposit", isDirty || newFiles.length > 0 || removedAttachmentIds.length > 0 || companyChanged || isSubmitting);

  const calcFinalAmount = useCallback(
    (base: number, vat: boolean, freelancer: boolean) => {
      let result = base;
      if (vat) result = Math.round(result * 1.1);
      if (freelancer) result = Math.round(result * (1 - 0.033));
      return result;
    },
    []
  );

  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^\d]/g, "");
      if (raw === "") {
        setAmountDisplay("");
        setSupplyAmount(0);
        setValue("amount", 0, { shouldValidate: true });
        return;
      }
      const num = parseInt(raw, 10);
      setSupplyAmount(num);
      setAmountDisplay(formatAmount(num));
      setValue("amount", calcFinalAmount(num, vatIncluded, freelancerDeduction), { shouldValidate: true });
    },
    [setValue, vatIncluded, freelancerDeduction, calcFinalAmount]
  );

  const handleVatToggle = useCallback(
    (checked: boolean) => {
      setVatIncluded(checked);
      if (supplyAmount <= 0) return;
      setValue("amount", calcFinalAmount(supplyAmount, checked, freelancerDeduction), { shouldValidate: true });
    },
    [setValue, supplyAmount, freelancerDeduction, calcFinalAmount]
  );

  const handleFreelancerToggle = useCallback(
    (checked: boolean) => {
      setFreelancerDeduction(checked);
      if (supplyAmount <= 0) return;
      setValue("amount", calcFinalAmount(supplyAmount, vatIncluded, checked), { shouldValidate: true });
    },
    [setValue, supplyAmount, vatIncluded, calcFinalAmount]
  );

  const handleDocumentTypeChange = useCallback(
    (fileId: string, documentType: string) => {
      setNewFiles((prev) =>
        prev.map((f) =>
          f.id === fileId ? { ...f, documentType: documentType as DocumentType } : f
        )
      );
      setDocTypeErrors((prev) => { const next = { ...prev }; delete next[fileId]; return next; });
    },
    []
  );

  const removeExistingAttachment = useCallback((id: string) => {
    setKeptAttachments((prev) => prev.filter((a) => a.id !== id));
    setRemovedAttachmentIds((prev) => [...prev, id]);
  }, []);

  const validateFiles = useCallback((): boolean => {
    let isValid = true;
    const totalFiles = keptAttachments.length + newFiles.length;
    if (totalFiles === 0) {
      setFileError("최소 1개의 파일을 첨부해야 합니다.");
      isValid = false;
    } else {
      setFileError(null);
    }
    const newDocTypeErrors: Record<string, boolean> = {};
    for (const file of newFiles) {
      if (!file.documentType) {
        newDocTypeErrors[file.id] = true;
        isValid = false;
      }
    }
    setDocTypeErrors(newDocTypeErrors);
    if (Object.keys(newDocTypeErrors).length > 0) {
      toast.error("모든 파일에 문서 유형을 선택해주세요.");
    }
    return isValid;
  }, [keptAttachments, newFiles]);

  const onValidationErrorDeposit = (fieldErrors: Record<string, unknown>) => {
    const fieldNames: Record<string, string> = {
      title: "제목",
      amount: "금액",
      category: "카테고리",
      bankName: "은행명",
      accountHolder: "예금주",
      accountNumber: "계좌번호",
      description: "설명",
    };
    const firstKey = Object.keys(fieldErrors)[0];
    const err = fieldErrors[firstKey] as { message?: string } | undefined;
    toast.error(`${fieldNames[firstKey] || firstKey}: ${err?.message || "입력 오류"}`);
  };

  const onSubmit = async (data: DepositRequestFormData) => {
    if (!validateFiles()) return;
    setIsSubmitting(true);
    try {
      // 승인된 요청은 허용 필드 중 **실제로 바꾼 것만** 보낸다.
      // - 잠금 필드를 안 보내야 "안 바꿨는데 403"이 날 여지가 없다.
      // - 안 바꾼 필드까지 보내면 서버가 키 존재만 보고 Slack 메시지를 지우고
      //   "수정되었습니다"로 다시 올린다 — 영수증만 보충해도 승인된 건이
      //   채널에 할 일처럼 다시 뜬다. 바꾼 게 없으면 PATCH 자체를 건너뛴다.
      const approvedPatch: Record<string, unknown> = {};
      if (isApprovedMode) {
        if (dirtyFields.title) approvedPatch.title = data.title;
        if (dirtyFields.description) approvedPatch.description = data.description || null;
        if (dirtyFields.category) approvedPatch.category = data.category;
        if (dirtyFields.isUrgent) approvedPatch.isUrgent = data.isUrgent;
        if (dirtyFields.dueDate) approvedPatch.dueDate = data.dueDate ? formatDateISO(data.dueDate) : null;
      }
      const skipPatch = isApprovedMode && Object.keys(approvedPatch).length === 0;
      const payload = isApprovedMode
        ? approvedPatch
        : {
            title: data.title,
            description: data.description || null,
            amount: data.amount,
            category: data.category,
            bankName: data.bankName,
            accountHolder: data.accountHolder,
            accountNumber: data.accountNumber,
            isUrgent: data.isUrgent,
            isPrePaid: data.isPrePaid,
            prePaidPercentage: data.prePaidPercentage ?? null,
            dueDate: data.dueDate ? formatDateISO(data.dueDate) : null,
            companyId: companyId || undefined,
            hasFreelancerWithholding: freelancerDeduction,
          };
      const response = skipPatch
        ? null
        : await fetch(`/api/expenses/${expense.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (response && !response.ok) {
        const errorData = await response.json().catch(() => null);
        // 403 — 편집 중에 승인돼 잠금 필드 변경이 막힌 경우 등. 서버 문구에
        // 바뀐 항목 이름과 "승인 취소 요청" 안내가 들어 있으니 그대로 보여주되,
        // 문장이 길어서 기본 4초로는 다 읽기 전에 사라져 조금 오래 띄운다.
        // 첨부 삭제·업로드도 하지 않는다(finally만 돌고 끝).
        if (response.status === 403) {
          toast.error(errorData?.error?.message || "비용 수정에 실패했습니다.", { duration: 8000 });
          // 편집 중에 승인된 경우 화면을 최신 상태(승인 모드)로 바꾼다.
          // 골라 둔 새 첨부 파일(newFiles)은 컴포넌트 상태라 그대로 남는다.
          router.refresh();
          return;
        }
        throw new Error(errorData?.error?.message || "비용 수정에 실패했습니다.");
      }
      // Delete removed attachments in parallel
      if (removedAttachmentIds.length > 0) {
        await Promise.allSettled(
          removedAttachmentIds.map((attachmentId) =>
            fetch(`/api/attachments/${attachmentId}`, { method: "DELETE" }),
          ),
        );
      }
      // Upload new attachments in parallel
      if (newFiles.length > 0) {
        const uploadResults = await Promise.allSettled(
          newFiles.map((fileItem) => {
            const formData = new FormData();
            formData.append("file", fileItem.file);
            formData.append("expenseId", expense.id);
            formData.append("documentType", fileItem.documentType || "OTHER");
            return fetch("/api/attachments/upload", { method: "POST", body: formData })
              .then((res) => { if (!res.ok) throw new Error(fileItem.file.name); return res; });
          }),
        );
        const failed = uploadResults.filter((r) => r.status === "rejected");
        if (failed.length > 0) {
          if (failed.length === newFiles.length) {
            toast.error("파일 업로드에 실패했습니다. 비용 상세에서 다시 첨부해주세요.");
          } else {
            toast.error(`${newFiles.length}개 파일 중 ${failed.length}개 업로드 실패. 비용 상세에서 다시 첨부해주세요.`);
          }
        }
      }
      toast.success("입금요청이 수정되었습니다.");
      router.push(`/expenses/${expense.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "비용 수정에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 납입 기일 (선택) — 제출 상태에선 입금 정보 카드에, 승인 모드에선 입금 정보
  // 카드가 없어서 기본 정보 카드에 그린다.
  const dueDateField = (
    <div className="space-y-1.5">
      <Label>
        납입 기일 <span className="text-[11px] text-[var(--apple-secondary-label)] font-normal">(선택)</span>
      </Label>
      <Controller
        name="dueDate"
        control={control}
        render={({ field }) => (
          <div className="flex items-center gap-2">
            <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
              <PopoverTrigger
                className={cn(
                  "flex h-10 flex-1 items-center justify-start gap-2 rounded-xl border border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)] px-3 text-sm transition-colors hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]",
                  !field.value && "text-[var(--apple-secondary-label)]"
                )}
              >
                <CalendarIcon className="size-4 text-[var(--apple-secondary-label)]" />
                {field.value ? format(field.value, "yyyy.MM.dd", { locale: ko }) : "날짜 선택"}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={field.value ?? undefined}
                  onSelect={(date) => {
                    field.onChange(date ?? null);
                    setDueDateOpen(false);
                  }}
                  disabled={(date) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    return date < today;
                  }}
                  locale={ko}
                />
              </PopoverContent>
            </Popover>
            {field.value && (
              <button
                type="button"
                onClick={() => field.onChange(null)}
                className="min-h-11 px-3 text-xs text-[var(--apple-secondary-label)] hover:text-[var(--apple-red)]"
              >
                해제
              </button>
            )}
          </div>
        )}
      />
      <p className="text-[11px] text-[var(--apple-secondary-label)]">
        납입 기일 지정 시 7일/3일/1일 전, 당일에 관리자에게 알림이 전송됩니다.
      </p>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/expenses/${expense.id}`} className="flex items-center justify-center size-8 rounded-full glass-subtle text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">입금요청 수정</h1>
          <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">
            {isApprovedMode
              ? "승인된 요청은 제목·카테고리·긴급·납입 기일·설명과 첨부파일만 수정할 수 있습니다."
              : "입금요청서를 수정합니다."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onValidationErrorDeposit)} noValidate>
        {isApprovedMode && (
          <ApprovedDepositLockedSummary
            expense={expense}
            companyName={initialCompanies.find((c) => c.id === expense.companyId)?.name ?? null}
          />
        )}

        <div className={cn("glass p-6", isApprovedMode && "mt-4")}>
          <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-1">기본 정보</h2>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mb-5"><span className="text-[var(--apple-red)]">*</span> 필수 항목</p>
          <div className="space-y-5">
            {!isApprovedMode && (
              <CompanySelector
                value={companyId}
                onChange={handleCompanyChange}
                userCompanyId={userCompanyId}
                initialCompanies={initialCompanies}
              />
            )}
            <div className="space-y-1.5">
              <Label htmlFor="title">제목 <span className="text-[var(--apple-red)]">*</span></Label>
              <Input id="title" placeholder="예: 외주 개발비 지급 요청" aria-invalid={!!errors.title} {...register("title")} />
              {errors.title && <p className="text-xs text-[var(--apple-red)]">{errors.title.message}</p>}
            </div>
            {/* 금액·VAT·원천징수 — 승인 후엔 잠금이라 위 요약 카드에서만 보여준다 */}
            {!isApprovedMode && (
              <div className="space-y-1.5">
                <Label htmlFor="amount">금액 <span className="text-[var(--apple-red)]">*</span></Label>
                <InputGroup>
                  <InputGroupInput id="amount" placeholder="0" inputMode="numeric" value={amountDisplay} onChange={handleAmountChange} aria-invalid={!!errors.amount} />
                  <InputGroupAddon align="inline-end"><InputGroupText>원</InputGroupText></InputGroupAddon>
                </InputGroup>
                {errors.amount && <p className="text-xs text-[var(--apple-red)]">{errors.amount.message}</p>}

                {/* VAT + 프리랜서 원천징수 */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={vatIncluded} onChange={(e) => handleVatToggle(e.target.checked)} className="size-4 rounded border-[rgba(0,0,0,0.15)] dark:border-[rgba(255,255,255,0.2)] text-[var(--apple-blue)] focus:ring-[var(--apple-blue)] cursor-pointer" />
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">VAT 포함 (+10%)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={freelancerDeduction} onChange={(e) => handleFreelancerToggle(e.target.checked)} className="size-4 rounded border-[rgba(0,0,0,0.15)] dark:border-[rgba(255,255,255,0.2)] text-[var(--apple-blue)] focus:ring-[var(--apple-blue)] cursor-pointer" />
                    <span className="text-[13px] text-[var(--apple-secondary-label)]">프리랜서 원천징수 (-3.3%)</span>
                  </label>
                </div>

                {/* 금액 내역 */}
                {supplyAmount > 0 && (vatIncluded || freelancerDeduction) && (() => {
                  const vatAmount = vatIncluded ? Math.round(supplyAmount * 0.1) : 0;
                  const freelancerAmount = freelancerDeduction ? Math.round((supplyAmount + vatAmount) * 0.033) : 0;
                  const finalAmount = calcFinalAmount(supplyAmount, vatIncluded, freelancerDeduction);
                  return (
                    <div className="mt-2 p-3 rounded-lg bg-[rgba(0,122,255,0.06)] text-[13px] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[var(--apple-secondary-label)]">공급가액</span>
                        <span>{formatAmount(supplyAmount)}원</span>
                      </div>
                      {vatIncluded && (
                        <div className="flex justify-between">
                          <span className="text-[var(--apple-secondary-label)]">VAT (+10%)</span>
                          <span>+{formatAmount(vatAmount)}원</span>
                        </div>
                      )}
                      {freelancerDeduction && (
                        <div className="flex justify-between">
                          <span className="text-[var(--apple-secondary-label)]">원천징수 (-3.3%)</span>
                          <span className="text-[var(--apple-red)]">-{formatAmount(freelancerAmount)}원</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.1)] pt-1 mt-1">
                        <span>실지급액</span>
                        <span className="text-[var(--apple-blue)]">{formatAmount(finalAmount)}원</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
            {/* 긴급 / 선지급 */}
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 cursor-pointer select-none px-3 py-2.5 rounded-xl glass-subtle hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)] transition-colors">
                <input type="checkbox" {...register("isUrgent")} className="size-4 rounded border-[rgba(0,0,0,0.15)] dark:border-[rgba(255,255,255,0.2)] text-[var(--apple-red)] focus:ring-[var(--apple-red)] cursor-pointer" />
                <div>
                  <span className="text-sm font-medium text-[var(--apple-label)]">긴급</span>
                  <p className="text-[12px] text-[var(--apple-secondary-label)]">빠른 처리가 필요한 경우 체크해주세요</p>
                </div>
              </label>
              {/* 선지급 — 승인 후엔 잠금(요약 카드에 표시) */}
              {!isApprovedMode && (
                <label className="flex items-center gap-3 cursor-pointer select-none px-3 py-2.5 rounded-xl glass-subtle hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)] transition-colors">
                  <input type="checkbox" {...register("isPrePaid")} className="size-4 rounded border-[rgba(0,0,0,0.15)] dark:border-[rgba(255,255,255,0.2)] text-[var(--apple-blue)] focus:ring-[var(--apple-blue)] cursor-pointer" />
                  <div>
                    <span className="text-sm font-medium text-[var(--apple-label)]">선지급</span>
                    <p className="text-[12px] text-[var(--apple-secondary-label)]">사전에 지급이 필요한 경우 체크해주세요</p>
                  </div>
                </label>
              )}
            </div>
            {/* 카테고리 — 프리셋 + 내가 쓰던 것 + 직접 입력 */}
            <Controller name="category" control={control} render={({ field }) => (
              <CategorySelectField
                value={field.value ?? ""}
                onChange={field.onChange}
                myCategories={myCategories}
                error={errors.category?.message}
              />
            )} />
            {isApprovedMode && dueDateField}
            <div className="space-y-1.5">
              <Label htmlFor="description">설명</Label>
              <Textarea id="description" placeholder="추가 설명을 입력해주세요 (선택사항)" rows={3} {...register("description")} />
              {errors.description && <p className="text-xs text-[var(--apple-red)]">{errors.description.message}</p>}
            </div>
          </div>
        </div>

        {/* 입금 정보 — 승인 후엔 계좌가 잠겨서 요약 카드로 대신한다 */}
        {!isApprovedMode && (
          <div className="glass p-6 mt-4">
            <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-5">입금 정보</h2>
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="bankName">은행명 <span className="text-[var(--apple-red)]">*</span></Label>
                <Input id="bankName" placeholder="예: 국민은행" aria-invalid={!!errors.bankName} {...register("bankName")} />
                {errors.bankName && <p className="text-xs text-[var(--apple-red)]">{errors.bankName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="accountHolder">예금주 <span className="text-[var(--apple-red)]">*</span></Label>
                <Input id="accountHolder" placeholder="예: 홍길동" aria-invalid={!!errors.accountHolder} {...register("accountHolder")} />
                {errors.accountHolder && <p className="text-xs text-[var(--apple-red)]">{errors.accountHolder.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="accountNumber">계좌번호 <span className="text-[var(--apple-red)]">*</span></Label>
                <Input id="accountNumber" placeholder="예: 123-456-789012" aria-invalid={!!errors.accountNumber} {...register("accountNumber")} />
                {errors.accountNumber && <p className="text-xs text-[var(--apple-red)]">{errors.accountNumber.message}</p>}
              </div>

              {dueDateField}
            </div>
          </div>
        )}

        {existingAttachments.length > 0 && (
          <div className="glass p-6 mt-4">
            <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-1">기존 첨부파일 ({keptAttachments.length})</h2>
            <p className="text-[13px] text-[var(--apple-secondary-label)] mb-4">삭제 버튼을 눌러 기존 파일을 제거할 수 있습니다.</p>
            {keptAttachments.length > 0 ? (
              <div className="space-y-2">{keptAttachments.map((attachment) => (<ExistingAttachmentItem key={attachment.id} attachment={attachment} onRemove={() => removeExistingAttachment(attachment.id)} />))}</div>
            ) : (
              <p className="text-sm text-[var(--apple-secondary-label)]">기존 첨부파일이 모두 삭제되었습니다.</p>
            )}
          </div>
        )}

        <div className="glass p-6 mt-4">
          <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-1">새 파일 첨부</h2>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mb-4">증빙서류를 추가로 첨부해주세요.{keptAttachments.length === 0 && " 최소 1개의 파일이 필요합니다."}</p>
          <FileUploadWithDocType files={newFiles} onFilesChange={(files) => { setNewFiles(files); if (files.length > 0 || keptAttachments.length > 0) setFileError(null); }} onDocumentTypeChange={handleDocumentTypeChange} documentTypeErrors={docTypeErrors} error={fileError ?? undefined} />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link href={`/expenses/${expense.id}`} className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full rounded-full h-11 glass border-[var(--apple-separator)]">취소</Button>
          </Link>
          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto rounded-full h-11 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)]">
            {isSubmitting ? (<><Loader2 className="size-4 animate-spin" />수정 중...</>) : "수정하기"}
          </Button>
        </div>
      </form>
    </div>
  );
}
