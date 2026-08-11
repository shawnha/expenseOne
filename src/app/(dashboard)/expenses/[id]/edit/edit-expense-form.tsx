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
import {
  corporateCardFormSchema,
  depositRequestFormSchema,
  type CorporateCardFormData,
  type DepositRequestFormData,
  type FileWithPreview,
  CATEGORY_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  formatAmount,
  formatDateISO,
  formatFileSize,
} from "@/lib/validations/expense-form";
import type { DocumentType } from "@/types";
import type { ExpenseEditData, ExistingAttachment, CompanyOption } from "./page";
import { cn } from "@/lib/utils";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EditExpenseFormProps {
  expense: ExpenseEditData;
  existingAttachments: ExistingAttachment[];
  initialCompanies: CompanyOption[];
  /**
   * 첨부만 수정 가능 (법카사용 7일 초과).
   * 거래 정보는 잠그고 영수증만 붙이거나 뗄 수 있게 한다.
   */
  attachmentsOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function EditExpenseForm({
  expense,
  existingAttachments,
  initialCompanies,
  attachmentsOnly = false,
}: EditExpenseFormProps) {
  if (expense.type === "CORPORATE_CARD") {
    if (attachmentsOnly) {
      return (
        <AttachmentsOnlyEditForm
          expense={expense}
          existingAttachments={existingAttachments}
        />
      );
    }
    return (
      <CorporateCardEditForm
        expense={expense}
        existingAttachments={existingAttachments}
        initialCompanies={initialCompanies}
      />
    );
  }

  return (
    <DepositRequestEditForm
      expense={expense}
      existingAttachments={existingAttachments}
      initialCompanies={initialCompanies}
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
  const [showCustomCategory, setShowCustomCategory] = useState(
    !CATEGORY_OPTIONS.some((opt) => opt.value === expense.category)
  );
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
            <div className="space-y-1.5">
              <Label>카테고리 <span className="text-[var(--apple-red)]">*</span></Label>
              <Controller name="category" control={control} render={({ field }) => (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => { field.onChange(option.value); setShowCustomCategory(false); }}
                        className={cn(
                          "px-4 py-2 rounded-full text-sm font-medium transition-all",
                          field.value === option.value && !showCustomCategory
                            ? "bg-[var(--apple-blue)] text-white shadow-sm"
                            : "glass-subtle text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setShowCustomCategory(true); field.onChange(""); }}
                      className={cn(
                        "px-4 py-2 rounded-full text-sm font-medium transition-all",
                        showCustomCategory
                          ? "bg-[var(--apple-blue)] text-white shadow-sm"
                          : "glass-subtle text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]"
                      )}
                    >
                      + 직접 입력
                    </button>
                  </div>
                  {showCustomCategory && (
                    <Input placeholder="카테고리를 직접 입력하세요" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value)} aria-invalid={!!errors.category} />
                  )}
                </div>
              )} />
              {errors.category && <p className="text-xs text-[var(--apple-red)]">{errors.category.message}</p>}
            </div>
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

function DepositRequestEditForm({
  expense,
  existingAttachments,
  initialCompanies,
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
  const [supplyAmount, setSupplyAmount] = useState(expense.amount);
  const [vatIncluded, setVatIncluded] = useState(false);
  const [freelancerDeduction, setFreelancerDeduction] = useState(
    expense.hasFreelancerWithholding ?? false
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const [docTypeErrors, setDocTypeErrors] = useState<Record<string, boolean>>({});
  const [showCustomCategory, setShowCustomCategory] = useState(
    !CATEGORY_OPTIONS.some((opt) => opt.value === expense.category)
  );
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
    formState: { errors, isDirty },
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
      const response = await fetch(`/api/expenses/${expense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
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

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/expenses/${expense.id}`} className="flex items-center justify-center size-8 rounded-full glass-subtle text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">입금요청 수정</h1>
          <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">입금요청서를 수정합니다.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onValidationErrorDeposit)} noValidate>
        <div className="glass p-6">
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
            <div className="space-y-1.5">
              <Label>카테고리 <span className="text-[var(--apple-red)]">*</span></Label>
              <Controller name="category" control={control} render={({ field }) => (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => { field.onChange(option.value); setShowCustomCategory(false); }}
                        className={cn(
                          "px-4 py-2 rounded-full text-sm font-medium transition-all",
                          field.value === option.value && !showCustomCategory
                            ? "bg-[var(--apple-blue)] text-white shadow-sm"
                            : "glass-subtle text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setShowCustomCategory(true); field.onChange(""); }}
                      className={cn(
                        "px-4 py-2 rounded-full text-sm font-medium transition-all",
                        showCustomCategory
                          ? "bg-[var(--apple-blue)] text-white shadow-sm"
                          : "glass-subtle text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]"
                      )}
                    >
                      + 직접 입력
                    </button>
                  </div>
                  {showCustomCategory && (
                    <Input placeholder="카테고리를 직접 입력하세요" value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value)} aria-invalid={!!errors.category} />
                  )}
                </div>
              )} />
              {errors.category && <p className="text-xs text-[var(--apple-red)]">{errors.category.message}</p>}
            </div>
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

            {/* 납입 기일 (선택) */}
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
                        className="text-xs text-[var(--apple-secondary-label)] hover:text-[var(--apple-red)] px-2 py-1"
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
// 첨부 전용 수정 — 법카사용 등록 7일 초과
//
// 거래 정보(금액·날짜·가맹점)는 카드 실제 사용 기록이라 나중에 바꾸면 안 되지만,
// 영수증은 나중에 받는 경우가 흔하다. 그래서 첨부만 손댈 수 있는 화면을 따로 둔다.
// 예전엔 이 경우 수정 페이지를 아예 거부하고 상세로 되돌려보냈는데, 상세 화면은
// 수정 버튼을 계속 띄우고 있어서 "눌러도 새로고침만 된다"로 보였다.
// ---------------------------------------------------------------------------

function AttachmentsOnlyEditForm({
  expense,
  existingAttachments,
}: {
  expense: ExpenseEditData;
  existingAttachments: ExistingAttachment[];
}) {
  const router = useRouter();
  const [newFiles, setNewFiles] = useState<FileWithPreview[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const keptAttachments = existingAttachments.filter(
    (a) => !removedAttachmentIds.includes(a.id),
  );
  const hasChanges = newFiles.length > 0 || removedAttachmentIds.length > 0;
  useUnsavedChanges(hasChanges);

  const handleSave = async () => {
    if (!hasChanges) {
      toast.info("변경된 첨부파일이 없습니다.");
      return;
    }
    setIsSubmitting(true);
    try {
      // 비용 자체는 PATCH하지 않는다. 첨부만 더하고 뺀다.
      if (removedAttachmentIds.length > 0) {
        await Promise.allSettled(
          removedAttachmentIds.map((attachmentId) =>
            fetch(`/api/attachments/${attachmentId}`, { method: "DELETE" }),
          ),
        );
      }

      if (newFiles.length > 0) {
        const results = await Promise.allSettled(
          newFiles.map((fileItem) => {
            const formData = new FormData();
            formData.append("file", fileItem.file);
            formData.append("expenseId", expense.id);
            formData.append("documentType", fileItem.documentType || "RECEIPT");
            return fetch("/api/attachments/upload", {
              method: "POST",
              body: formData,
            }).then(async (res) => {
              if (!res.ok) {
                const json = await res.json().catch(() => null);
                throw new Error(json?.error?.message ?? "업로드 실패");
              }
            });
          }),
        );
        const failed = results.filter((r) => r.status === "rejected");
        if (failed.length > 0) {
          throw new Error(
            `${failed.length}개 파일 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.`,
          );
        }
      }

      toast.success("영수증이 저장되었습니다.");
      router.push(`/expenses/${expense.id}`);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "저장에 실패했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href={`/expenses/${expense.id}`}
          className="flex items-center justify-center size-8 rounded-full glass-subtle text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">영수증 첨부</h1>
          <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">
            등록 후 7일이 지나 거래 정보는 수정할 수 없습니다.
          </p>
        </div>
      </div>

      {/* 어떤 건인지 확인할 수 있게 읽기 전용 요약 */}
      <div className="glass p-5">
        <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-3">
          {expense.title}
        </h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-[var(--apple-secondary-label)]">금액</dt>
          <dd className="text-right tabular-nums text-[var(--apple-label)]">
            {formatAmount(expense.amount)}원
          </dd>
          <dt className="text-[var(--apple-secondary-label)]">거래일</dt>
          <dd className="text-right tabular-nums text-[var(--apple-label)]">
            {expense.transactionDate?.replace(/-/g, ".")}
          </dd>
          {expense.merchantName && (
            <>
              <dt className="text-[var(--apple-secondary-label)]">가맹점</dt>
              <dd className="text-right text-[var(--apple-label)]">
                {expense.merchantName}
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="glass p-6 space-y-4">
        <h2 className="text-subheadline font-semibold text-[var(--apple-label)]">
          영수증
        </h2>

        {keptAttachments.length > 0 && (
          <div className="space-y-2">
            {keptAttachments.map((attachment) => (
              <ExistingAttachmentItem
                key={attachment.id}
                attachment={attachment}
                onRemove={() =>
                  setRemovedAttachmentIds((prev) => [...prev, attachment.id])
                }
              />
            ))}
          </div>
        )}

        <FileUpload files={newFiles} onFilesChange={setNewFiles} />
      </div>

      <div className="flex gap-3">
        <Link
          href={`/expenses/${expense.id}`}
          className="flex-1 h-11 rounded-full glass-subtle flex items-center justify-center text-[15px] font-medium text-[var(--apple-label)]"
        >
          취소
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSubmitting || !hasChanges}
          className="flex-1 h-11 rounded-full bg-[var(--apple-blue)] text-white text-[15px] font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting && <Loader2 className="size-4 animate-spin" />}
          저장
        </button>
      </div>
    </div>
  );
}
