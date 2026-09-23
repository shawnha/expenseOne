"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { ConvertToCardDialog } from "@/components/expenses/convert-to-card-dialog";
import { canShowConvertButton } from "@/lib/expense-convert";
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
import {
  combineAttachmentWarnings,
  countUploadFailures,
  deleteFailureMessage,
  uploadFailureMessage,
} from "@/lib/utils/upload-results";
import {
  calcDepositAmount,
  calcDepositBreakdownKRW,
  resolveEditedAmount,
} from "@/lib/utils/deposit-amount";
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
  /** 보는 사람(=제출자) 프로필의 카드 끝 4자리. 없으면 법카 변경 다이얼로그가 미리 경고한다. */
  viewerCardLastFour?: string | null;
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
  viewerCardLastFour = null,
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
      viewerCardLastFour={viewerCardLastFour}
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
  /** USD 등 외화 건은 금액을 잠근다 — ForeignCurrencyAmountLock 주석 참고. */
  const isForeignCurrency = expense.currency !== "KRW";
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
  // 작성·제출 중엔 새 배포의 강제 새로고침을 미룬다 (sw-update-prompt).
  // 금액은 RHF register가 아니라 setValue(shouldDirty 없음)로 쓰므로 isDirty에 안 잡힌다 —
  // 화면에 보이는 값(amountDisplay)을 처음 값과 비교해 따로 본다.
  const amountChanged = amountDisplay !== formatAmount(expense.amount);
  useFormBusy("expense-edit-card", isDirty || newFiles.length > 0 || removedAttachmentIds.length > 0 || companyChanged || amountChanged || isSubmitting);

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
          // 외화 건은 amount를 보내지 않는다(입금요청 수정 폼과 같은 이유).
          ...(isForeignCurrency ? {} : { amount: data.amount }),
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

      // Delete removed attachments in parallel.
      // 결과를 버리면 403/500으로 삭제가 실패해도 "수정되었습니다"만 뜨고,
      // 지운 줄 알았던 영수증이 그대로 남는다. 업로드와 같은 규칙으로 센다
      // (DELETE엔 !res.ok throw가 없어 헬퍼의 !ok 분기가 동작한다).
      let deleteWarning: string | null = null;
      if (removedAttachmentIds.length > 0) {
        const deleteResults = await Promise.allSettled(
          removedAttachmentIds.map((attachmentId) =>
            fetch(`/api/attachments/${attachmentId}`, { method: "DELETE" }),
          ),
        );
        deleteWarning = deleteFailureMessage(
          countUploadFailures(deleteResults),
          removedAttachmentIds.length,
        );
      }

      // Upload new attachments in parallel
      let uploadWarning: string | null = null;
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
        uploadWarning = uploadFailureMessage(countUploadFailures(uploadResults), newFiles.length);
      }
      const attachmentWarning = combineAttachmentWarnings(uploadWarning, deleteWarning);

      // 성공 토스트와 실패 토스트가 같이 뜨면 실패가 묻힌다. 수정 후 상세 화면으로
      // 이동하므로 거기서 바로 다시 첨부하면 된다.
      if (attachmentWarning) toast.error(`수정은 저장됐지만 ${attachmentWarning}`, { duration: 8000 });
      else toast.success("비용이 수정되었습니다.");
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
            {isForeignCurrency ? (
              <ForeignCurrencyAmountLock expense={expense} />
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="amount">금액 <span className="text-[var(--apple-red)]">*</span></Label>
                <InputGroup>
                  <InputGroupInput id="amount" placeholder="0" inputMode="numeric" value={amountDisplay} onChange={handleAmountChange} aria-invalid={!!errors.amount} />
                  <InputGroupAddon align="inline-end"><InputGroupText>원</InputGroupText></InputGroupAddon>
                </InputGroup>
                {errors.amount && <p className="text-xs text-[var(--apple-red)]">{errors.amount.message}</p>}
              </div>
            )}
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

/** 승인된 요청을 고칠 때 위에 뜨는 안내(비관리자). 막지는 않고, 무슨 일이 일어나는지만 알린다. */
function ApprovedEditNotice() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[rgba(0,122,255,0.2)] bg-[rgba(0,122,255,0.1)] p-4">
      <Lock className="mt-0.5 size-4 shrink-0 text-[var(--apple-blue)]" aria-hidden="true" />
      <p className="text-[13px] leading-relaxed text-[var(--apple-label)]">
        이미 승인된 요청입니다. 무엇이든 고칠 수 있지만, 금액·계좌·회사·선지급·원천징수·거래일을 바꾸면
        관리자에게 알림이 갑니다. 이미 송금이 끝난 건이면 고치기 전에 관리자와 먼저 이야기해주세요.
      </p>
    </div>
  );
}

/**
 * USD 등 외화 건의 금액 잠금 카드.
 *
 * 이 화면의 금액 칸은 원화 정수 하나만 다룬다. 외화 건을 그대로 열면
 * 칸에는 원화 환산액이 뜨고, 저장하면 amount(원화)만 덮어써지는 반면
 * amountOriginal(센트)·exchangeRate는 예전 값으로 남는다
 * (expense.service.ts updateExpense의 갱신 대상에 없다). 그러면 상세·CSV의
 * formatExpenseAmount가 "$100.00 / 200,000원"처럼 서로 안 맞는 금액을 보여준다.
 * 그래서 외화 건은 금액을 잠그고 — 제목·카테고리·첨부 수정은 그대로 된다 —
 * PATCH 본문에서도 amount를 뺀다.
 */
function ForeignCurrencyAmountLock({ expense }: { expense: ExpenseEditData }) {
  return (
    <div className="space-y-1.5">
      <Label>금액</Label>
      <div className="rounded-xl bg-[rgba(0,0,0,0.04)] p-4 dark:bg-[rgba(255,255,255,0.06)]">
        <p className="text-xl font-semibold tabular-nums text-[var(--apple-label)] break-words">
          {formatExpenseAmount(expense.amount, expense.currency, expense.amountOriginal)}
        </p>
      </div>
      <div className="flex items-start gap-2.5 rounded-xl border border-[rgba(0,122,255,0.2)] bg-[rgba(0,122,255,0.1)] p-4">
        <Lock className="mt-0.5 size-4 shrink-0 text-[var(--apple-blue)]" aria-hidden="true" />
        <p className="text-[13px] leading-relaxed text-[var(--apple-label)]">
          통화가 {expense.currency}인 건은 이 화면에서 금액을 바꿀 수 없습니다. 금액이
          잘못됐다면 이 건을 삭제하고 다시 등록해주세요. 제목·카테고리·첨부는 수정할 수 있습니다.
        </p>
      </div>
    </div>
  );
}


function DepositRequestEditForm({
  expense,
  existingAttachments,
  initialCompanies,
  myCategories = [],
  viewerIsAdmin = false,
  viewerCardLastFour = null,
}: EditExpenseFormProps) {
  const router = useRouter();
  // 승인된 요청도 전부 고칠 수 있다(오너 결정 2026-09-23 — 잠금 해제). 다만 **바꾼 칸만** 보낸다:
  // 영수증만 보충했는데 폼 전체를 보내면 서버가 Slack 메시지를 지우고 "수정되었습니다"로
  // 다시 올려, 이미 끝난 건이 채널에 할 일처럼 뜬다. 금액·계좌를 실제로 바꾸면 서버가
  // 관리자에게 알림을 보낸다(비관리자일 때).
  const approvedEdit = expense.status === "APPROVED";
  const [newFiles, setNewFiles] = useState<FileWithPreview[]>([]);
  const [keptAttachments, setKeptAttachments] =
    useState<ExistingAttachment[]>(existingAttachments);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amountDisplay, setAmountDisplay] = useState(
    formatAmount(expense.amount)
  );
  // 저장된 `expense.amount`는 부가세·원천징수가 **이미 반영된 최종 금액**이고,
  // 공급가액은 저장하지 않아 복원할 수 없다. 그래서 공급가액은 "모름"(0)에서
  // 시작하고, 사용자가 이 화면에서 실제로 새 금액을 입력하거나 토글을 건드릴
  // 때만 계산기를 켠다(calcActive).
  //
  // 예전엔 supplyAmount를 expense.amount로 채워 두고 원천징수 토글이 DB 값으로
  // 켜져 있었다. 그래서 (1) 화면을 열자마자 "공급가액 96,700 / 실지급액 93,509"
  // 라는 없는 내역이 뜨고, (2) 금액 칸을 한 글자만 건드려도 이미 차감된 금액에
  // 3.3%를 또 빼서 저장할 때마다 금액이 줄었다.
  const [supplyAmount, setSupplyAmount] = useState(0);
  const [vatIncluded, setVatIncluded] = useState(false);
  const [freelancerDeduction, setFreelancerDeduction] = useState(
    expense.hasFreelancerWithholding ?? false
  );
  /** 이 화면에서 토글을 실제로 건드렸는가. 건드리기 전엔 입력한 숫자 = 최종 금액. */
  const [calcActive, setCalcActive] = useState(false);
  /** USD 건은 amount(원화)만 고쳐지고 amountOriginal(센트)·환율은 그대로 남아 금액이 어긋난다. */
  const isForeignCurrency = expense.currency !== "KRW";
  const [fileError, setFileError] = useState<string | null>(null);
  const [docTypeErrors, setDocTypeErrors] = useState<Record<string, boolean>>({});
  const [dueDateOpen, setDueDateOpen] = useState(false);
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

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<DepositRequestFormData>({
    resolver: zodResolver(depositRequestFormSchema),
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
  // 작성·제출 중엔 새 배포의 강제 새로고침을 미룬다 (sw-update-prompt).
  // 금액·부가세·원천징수는 RHF register가 아니라 setValue(shouldDirty 없음)·로컬 state로
  // 쓰므로 isDirty에 안 잡힌다 — 처음 값과 비교해 따로 본다(셋 다 제출 금액을 바꾼다).
  const amountChanged =
    amountDisplay !== formatAmount(expense.amount) ||
    vatIncluded ||
    freelancerDeduction !== (expense.hasFreelancerWithholding ?? false);
  useFormBusy("expense-edit-deposit", isDirty || newFiles.length > 0 || removedAttachmentIds.length > 0 || companyChanged || amountChanged || isSubmitting);

  // 금액 계산은 생성 폼과 같은 헬퍼(@/lib/utils/deposit-amount)를 쓴다.
  // 예전엔 이 파일에 calcFinalAmount 복제본이 있어 두 경로가 갈라졌다.
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
      // 토글을 건드리기 전이면 입력한 숫자가 곧 최종 금액이다. 배율을 다시
      // 적용하면 이미 차감된 금액에서 또 깎인다.
      setValue(
        "amount",
        resolveEditedAmount(num, calcActive, vatIncluded, freelancerDeduction),
        { shouldValidate: true },
      );
    },
    [setValue, vatIncluded, freelancerDeduction, calcActive]
  );

  const handleVatToggle = useCallback(
    (checked: boolean) => {
      setVatIncluded(checked);
      setCalcActive(true);
      // 새 공급가액을 입력하지 않았으면(supplyAmount === 0) 저장된 금액을
      // 그대로 둔다 — 토글만 껐다 켜도 3.3%가 또 빠지던 문제.
      if (supplyAmount <= 0) return;
      setValue("amount", calcDepositAmount(supplyAmount, "KRW", checked, freelancerDeduction), { shouldValidate: true });
    },
    [setValue, supplyAmount, freelancerDeduction]
  );

  const handleFreelancerToggle = useCallback(
    (checked: boolean) => {
      setFreelancerDeduction(checked);
      setCalcActive(true);
      if (supplyAmount <= 0) return;
      setValue("amount", calcDepositAmount(supplyAmount, "KRW", vatIncluded, checked), { shouldValidate: true });
    },
    [setValue, supplyAmount, vatIncluded]
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
      // 승인된 요청은 **실제로 바꾼 칸만** 보낸다(위 approvedEdit 설명). 바꾼 게 없으면
      // PATCH 자체를 건너뛴다 — 첨부만 손봤을 때 Slack 재게시를 부르지 않기 위해서다.
      const approvedPatch: Record<string, unknown> = {};
      if (approvedEdit) {
        if (dirtyFields.title) approvedPatch.title = data.title;
        if (dirtyFields.description) approvedPatch.description = data.description || null;
        if (dirtyFields.category) approvedPatch.category = data.category;
        if (dirtyFields.isUrgent) approvedPatch.isUrgent = data.isUrgent;
        if (dirtyFields.dueDate) approvedPatch.dueDate = data.dueDate ? formatDateISO(data.dueDate) : null;
        // 외화 건은 amount를 보내지 않는다(아래 일반 경로와 같은 이유).
        if (dirtyFields.amount && !isForeignCurrency) approvedPatch.amount = data.amount;
        if (dirtyFields.bankName) approvedPatch.bankName = data.bankName;
        if (dirtyFields.accountHolder) approvedPatch.accountHolder = data.accountHolder;
        if (dirtyFields.accountNumber) approvedPatch.accountNumber = data.accountNumber;
        if (dirtyFields.isPrePaid) approvedPatch.isPrePaid = data.isPrePaid;
        if (dirtyFields.prePaidPercentage) approvedPatch.prePaidPercentage = data.prePaidPercentage ?? null;
        // 회사·원천징수는 react-hook-form 밖의 상태라 처음 값과 직접 견준다.
        if (companyId && companyId !== (expense.companyId ?? "")) approvedPatch.companyId = companyId;
        if (freelancerDeduction !== (expense.hasFreelancerWithholding ?? false)) {
          approvedPatch.hasFreelancerWithholding = freelancerDeduction;
        }
      }
      const skipPatch = approvedEdit && Object.keys(approvedPatch).length === 0;
      const payload = approvedEdit
        ? approvedPatch
        : {
            title: data.title,
            description: data.description || null,
            // 외화 건은 amount를 아예 보내지 않는다 — 보내면 원화 금액만 바뀌고
            // amountOriginal(센트)·환율이 그대로 남아 두 금액이 어긋난다.
            ...(isForeignCurrency ? {} : { amount: data.amount }),
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
      // Delete removed attachments in parallel.
      // 결과를 버리면 403/500으로 삭제가 실패해도 "수정되었습니다"만 뜨고,
      // 지운 줄 알았던 영수증이 그대로 남는다. 업로드와 같은 규칙으로 센다
      // (DELETE엔 !res.ok throw가 없어 헬퍼의 !ok 분기가 동작한다).
      let deleteWarning: string | null = null;
      if (removedAttachmentIds.length > 0) {
        const deleteResults = await Promise.allSettled(
          removedAttachmentIds.map((attachmentId) =>
            fetch(`/api/attachments/${attachmentId}`, { method: "DELETE" }),
          ),
        );
        deleteWarning = deleteFailureMessage(
          countUploadFailures(deleteResults),
          removedAttachmentIds.length,
        );
      }
      // Upload new attachments in parallel
      let uploadWarning: string | null = null;
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
        uploadWarning = uploadFailureMessage(countUploadFailures(uploadResults), newFiles.length);
      }
      const attachmentWarning = combineAttachmentWarnings(uploadWarning, deleteWarning);
      // 실패는 성공 토스트에 묻히지 않게 따로 알린다. 이어서 상세 화면으로 이동한다.
      if (attachmentWarning) toast.error(`수정은 저장됐지만 ${attachmentWarning}`, { duration: 8000 });
      else toast.success("입금요청이 수정되었습니다.");
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
            {approvedEdit
              ? "이미 승인된 요청입니다. 금액·계좌를 바꾸면 관리자에게 알림이 갑니다."
              : "입금요청서를 수정합니다."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onValidationErrorDeposit)} noValidate>
        {approvedEdit && !viewerIsAdmin && <ApprovedEditNotice />}

        <div className={cn("glass p-6", approvedEdit && !viewerIsAdmin && "mt-4")}>
          <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-1">기본 정보</h2>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mb-5"><span className="text-[var(--apple-red)]">*</span> 필수 항목</p>
          <div className="space-y-5">
            <CompanySelector
              value={companyId}
              onChange={handleCompanyChange}
              userCompanyId={userCompanyId}
              initialCompanies={initialCompanies}
            />
            <div className="space-y-1.5">
              <Label htmlFor="title">제목 <span className="text-[var(--apple-red)]">*</span></Label>
              <Input id="title" placeholder="예: 외주 개발비 지급 요청" aria-invalid={!!errors.title} {...register("title")} />
              {errors.title && <p className="text-xs text-[var(--apple-red)]">{errors.title.message}</p>}
            </div>
            {isForeignCurrency && (
              <ForeignCurrencyAmountLock expense={expense} />
            )}
            {!isForeignCurrency && (
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

                {/* 금액 내역 — 토글을 실제로 건드려 계산기를 켰을 때만 보여준다.
                    저장된 금액은 이미 최종값이라, 열자마자 공급가액/실지급액을
                    그리면 있지도 않은 차감 내역을 보여주게 된다. */}
                {calcActive && supplyAmount > 0 && (vatIncluded || freelancerDeduction) && (() => {
                  const bd = calcDepositBreakdownKRW(supplyAmount, "KRW", vatIncluded, freelancerDeduction, null)!;
                  const vatAmount = bd.vatKRW;
                  const freelancerAmount = bd.withholdingKRW;
                  const finalAmount = bd.finalKRW;
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
              <label className="flex items-center gap-3 cursor-pointer select-none px-3 py-2.5 rounded-xl glass-subtle hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)] transition-colors">
                <input type="checkbox" {...register("isPrePaid")} className="size-4 rounded border-[rgba(0,0,0,0.15)] dark:border-[rgba(255,255,255,0.2)] text-[var(--apple-blue)] focus:ring-[var(--apple-blue)] cursor-pointer" />
                <div>
                  <span className="text-sm font-medium text-[var(--apple-label)]">선지급</span>
                  <p className="text-[12px] text-[var(--apple-secondary-label)]">사전에 지급이 필요한 경우 체크해주세요</p>
                </div>
              </label>
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
              <Label htmlFor="description">설명</Label>
              <Textarea id="description" placeholder="추가 설명을 입력해주세요 (선택사항)" rows={3} {...register("description")} />
              {errors.description && <p className="text-xs text-[var(--apple-red)]">{errors.description.message}</p>}
            </div>
          </div>
        </div>

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
          {/* 법카로 결제한 건이면 승인 없이 바로 법카 사용으로 — 제출 상태에서만(서버가 최종 판단) */}
          {canShowConvertButton(expense) && (
            <ConvertToCardDialog expenseId={expense.id} transactionDate={expense.transactionDate} viewerCardLastFour={viewerCardLastFour} disabled={isSubmitting} />
          )}
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
