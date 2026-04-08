"use client";

import React, { useState, useCallback } from "react";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { ExpenseEditData, ExistingAttachment } from "./page";
import { cn } from "@/lib/utils";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EditExpenseFormProps {
  expense: ExpenseEditData;
  existingAttachments: ExistingAttachment[];
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function EditExpenseForm({
  expense,
  existingAttachments,
}: EditExpenseFormProps) {
  if (expense.type === "CORPORATE_CARD") {
    return (
      <CorporateCardEditForm
        expense={expense}
        existingAttachments={existingAttachments}
      />
    );
  }

  return (
    <DepositRequestEditForm
      expense={expense}
      existingAttachments={existingAttachments}
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
        <a
          href={`/api/attachments/${attachment.id}/download`}
          target="_blank"
          rel="noopener noreferrer"
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
  useUnsavedChanges(isDirty || newFiles.length > 0 || removedAttachmentIds.length > 0);

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
  const [fileError, setFileError] = useState<string | null>(null);
  const [docTypeErrors, setDocTypeErrors] = useState<Record<string, boolean>>({});
  const [showCustomCategory, setShowCustomCategory] = useState(
    !CATEGORY_OPTIONS.some((opt) => opt.value === expense.category)
  );

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
      description: expense.description ?? "",
    },
  });

  // Warn on unsaved changes (browser close / refresh)
  useUnsavedChanges(isDirty || newFiles.length > 0 || removedAttachmentIds.length > 0);

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
