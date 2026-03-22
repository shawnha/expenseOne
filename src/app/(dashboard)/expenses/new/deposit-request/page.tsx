"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  ChevronsUpDown,
  Check,
  Clock,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { FileUploadWithDocType } from "@/components/forms/file-upload";
import dynamic from "next/dynamic";
const SubmitSuccessDialog = dynamic(() => import("@/components/forms/submit-success-dialog").then(m => m.SubmitSuccessDialog), { ssr: false });
import {
  depositRequestFormSchema,
  type DepositRequestFormData,
  type FileWithPreview,
  CATEGORY_OPTIONS,
  formatAmount,
  formatDateISO,
} from "@/lib/validations/expense-form";
import type { DocumentType } from "@/types";
import { cn } from "@/lib/utils";

// ============================================================
// 은행 목록 (시중은행 + 인터넷은행 + 특수은행)
// ============================================================
const BANK_LIST = [
  // 시중은행
  "KB국민은행",
  "신한은행",
  "하나은행",
  "우리은행",
  "SC제일은행",
  "한국씨티은행",
  // 지방은행
  "IBK기업은행",
  "NH농협은행",
  "Sh수협은행",
  "대구은행",
  "부산은행",
  "광주은행",
  "전북은행",
  "경남은행",
  "제주은행",
  // 인터넷은행
  "카카오뱅크",
  "케이뱅크",
  "토스뱅크",
  // 특수은행
  "KDB산업은행",
  "한국수출입은행",
  "새마을금고",
  "신협",
  "우체국",
  "저축은행",
];

// ============================================================
// 최근 계좌 관리 (localStorage)
// ============================================================
interface RecentAccount {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  usedAt: number; // timestamp
}

const RECENT_ACCOUNTS_KEY = "expense-recent-accounts";
const MAX_RECENT_ACCOUNTS = 5;

function getRecentAccounts(): RecentAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentAccount(account: Omit<RecentAccount, "usedAt">) {
  const accounts = getRecentAccounts();
  // Remove duplicate
  const filtered = accounts.filter(
    (a) =>
      !(
        a.bankName === account.bankName &&
        a.accountNumber === account.accountNumber
      )
  );
  // Add to front
  filtered.unshift({ ...account, usedAt: Date.now() });
  // Keep max
  const trimmed = filtered.slice(0, MAX_RECENT_ACCOUNTS);
  localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(trimmed));
}

export default function DepositRequestPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [amountDisplay, setAmountDisplay] = useState("");
  const [vatIncluded, setVatIncluded] = useState(false);
  const [freelancerDeduction, setFreelancerDeduction] = useState(false);
  const [supplyAmount, setSupplyAmount] = useState(0);
  const [bankOpen, setBankOpen] = useState(false);
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [docTypeErrors, setDocTypeErrors] = useState<Record<string, boolean>>(
    {}
  );

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DepositRequestFormData>({
    resolver: zodResolver(depositRequestFormSchema),
    shouldFocusError: true,
    defaultValues: {
      title: "",
      bankName: "",
      accountHolder: "",
      accountNumber: "",
      description: "",
      isUrgent: false,
      isPrePaid: false,
      prePaidPercentage: null,
    },
  });

  const watchedIsPrePaid = watch("isPrePaid");
  const watchedPrePaidPercentage = watch("prePaidPercentage");
  const watchedAmount = watch("amount");
  const [prePaidMode, setPrePaidMode] = useState<"full" | "partial">("full");

  useEffect(() => {
    setRecentAccounts(getRecentAccounts());
  }, []);

  const applyRecentAccount = useCallback(
    (account: RecentAccount) => {
      setValue("bankName", account.bankName, { shouldValidate: true });
      setValue("accountHolder", account.accountHolder, { shouldValidate: true });
      setValue("accountNumber", account.accountNumber, { shouldValidate: true });
      toast.success("계좌 정보가 입력되었습니다.");
    },
    [setValue]
  );

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
      if (supplyAmount > 0) {
        setValue("amount", calcFinalAmount(supplyAmount, checked, freelancerDeduction), { shouldValidate: true });
      }
    },
    [setValue, supplyAmount, freelancerDeduction, calcFinalAmount]
  );

  const handleFreelancerToggle = useCallback(
    (checked: boolean) => {
      setFreelancerDeduction(checked);
      if (supplyAmount > 0) {
        setValue("amount", calcFinalAmount(supplyAmount, vatIncluded, checked), { shouldValidate: true });
      }
    },
    [setValue, supplyAmount, vatIncluded, calcFinalAmount]
  );

  const handleDocumentTypeChange = useCallback(
    (fileId: string, documentType: string) => {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === fileId
            ? { ...f, documentType: documentType as DocumentType }
            : f
        )
      );
      setDocTypeErrors((prev) => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
    },
    []
  );

  const validateFiles = useCallback((): boolean => {
    let isValid = true;

    if (files.length === 0) {
      setFileError("최소 1개의 파일을 첨부해야 합니다.");
      isValid = false;
    } else {
      setFileError(null);
    }

    const newDocTypeErrors: Record<string, boolean> = {};
    for (const file of files) {
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
  }, [files]);

  const onValidationError = (fieldErrors: Record<string, unknown>) => {
    const fieldNames: Record<string, string> = {
      title: "제목",
      amount: "금액",
      category: "카테고리",
      bankName: "은행명",
      accountHolder: "예금주",
      accountNumber: "계좌번호",
      description: "설명",
      isUrgent: "긴급",
      isPrePaid: "선지급",
      prePaidPercentage: "선지급 비율",
    };
    const messages = Object.entries(fieldErrors)
      .map(([key, err]) => {
        const label = fieldNames[key] || key;
        const msg = (err as { message?: string })?.message || "입력 오류";
        return `${label}: ${msg}`;
      });
    const errorMsg = messages[0] || "입력값을 확인해주세요.";
    toast.error(errorMsg);
  };

  const onSubmit = async (data: DepositRequestFormData) => {
    if (!validateFiles()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "DEPOSIT_REQUEST",
          title: data.title,
          description: data.description || null,
          amount: data.amount,
          category: data.category,
          bankName: data.bankName,
          accountHolder: data.accountHolder,
          accountNumber: data.accountNumber,
          transactionDate: formatDateISO(new Date()),
          isUrgent: data.isUrgent || false,
          isPrePaid: data.isPrePaid || false,
          prePaidPercentage: data.prePaidPercentage ?? null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error?.message || "입금요청 제출에 실패했습니다."
        );
      }

      const result = await response.json();
      const expenseId = result.data?.id;

      if (expenseId) {
        const uploadResults = await Promise.allSettled(
          files.map((fileItem) => {
            const formData = new FormData();
            formData.append("file", fileItem.file);
            formData.append("expenseId", expenseId);
            formData.append("documentType", fileItem.documentType || "OTHER");
            return fetch("/api/attachments/upload", { method: "POST", body: formData })
              .then((res) => { if (!res.ok) throw new Error(fileItem.file.name); return res; });
          })
        );
        uploadResults.forEach((r) => {
          if (r.status === "rejected") {
            toast.error(`파일 "${r.reason?.message}" 업로드에 실패했습니다.`);
          }
        });
      }

      // Save to recent accounts
      saveRecentAccount({
        bankName: data.bankName,
        accountHolder: data.accountHolder,
        accountNumber: data.accountNumber,
      });

      setShowSuccess(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "입금요청 제출에 실패했습니다."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/expenses/new" className="flex items-center justify-center size-11 rounded-full glass-subtle text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">입금요청 작성</h1>
          <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">
            입금요청서를 작성해주세요. 관리자 승인 후 처리됩니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onValidationError)} noValidate>
        {/* 기본 정보 */}
        <div className="glass p-6">
          <h2 className="text-[15px] font-semibold text-[var(--apple-label)] mb-1">
            기본 정보
          </h2>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mb-5">
            <span className="text-[var(--apple-red)]">*</span> 필수 항목
          </p>

          <div className="space-y-5">
            {/* 제목 */}
            <div className="space-y-1.5">
              <Label htmlFor="title">
                제목 <span className="text-[var(--apple-red)]">*</span>
              </Label>
              <Input
                id="title"
                placeholder="예: 외주 개발비 지급 요청"
                aria-invalid={!!errors.title}
                {...register("title")}
              />
              {errors.title && (
                <p className="text-xs text-[var(--apple-red)]">
                  {errors.title.message}
                </p>
              )}
            </div>

            {/* 금액 */}
            <div className="space-y-1.5">
              <Label htmlFor="amount">
                금액 <span className="text-[var(--apple-red)]">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="amount"
                  placeholder="0"
                  inputMode="numeric"
                  value={amountDisplay}
                  onChange={handleAmountChange}
                  aria-invalid={!!errors.amount}
                  className="pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--apple-secondary-label)] pointer-events-none">원</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={vatIncluded}
                    onChange={(e) => handleVatToggle(e.target.checked)}
                    className="size-5 rounded-md border-2 border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] accent-[var(--apple-blue)] cursor-pointer transition-colors"
                  />
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">VAT 포함 (+10%)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={freelancerDeduction}
                    onChange={(e) => handleFreelancerToggle(e.target.checked)}
                    className="size-5 rounded-md border-2 border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] accent-[var(--apple-blue)] cursor-pointer transition-colors"
                  />
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">프리랜서 원천징수 (-3.3%)</span>
                </label>
              </div>
              {(vatIncluded || freelancerDeduction) && supplyAmount > 0 && (() => {
                let afterVat = supplyAmount;
                const vatAmount = vatIncluded ? Math.round(supplyAmount * 0.1) : 0;
                if (vatIncluded) afterVat = supplyAmount + vatAmount;
                const withholdingBase = afterVat;
                const withholdingAmount = freelancerDeduction ? Math.round(withholdingBase * 0.033) : 0;
                const finalAmount = withholdingBase - withholdingAmount;
                return (
                  <div className="px-3 py-2 text-[13px] text-[var(--apple-secondary-label)] space-y-0.5 border border-[rgba(0,0,0,0.06)] rounded-xl">
                    <div className="flex justify-between">
                      <span>공급가액</span>
                      <span>{formatAmount(supplyAmount)}원</span>
                    </div>
                    {vatIncluded && (
                      <div className="flex justify-between">
                        <span>VAT (10%)</span>
                        <span>+{formatAmount(vatAmount)}원</span>
                      </div>
                    )}
                    {freelancerDeduction && (
                      <div className="flex justify-between">
                        <span>원천징수 (3.3%)</span>
                        <span>-{formatAmount(withholdingAmount)}원</span>
                      </div>
                    )}
                    <div className="flex justify-between font-medium text-[var(--apple-label)] pt-1 border-t border-[rgba(0,0,0,0.06)]">
                      <span>실지급액</span>
                      <span>{formatAmount(finalAmount)}원</span>
                    </div>
                  </div>
                );
              })()}
              {errors.amount && (
                <p className="text-xs text-[var(--apple-red)]">
                  {errors.amount.message}
                </p>
              )}
            </div>

            {/* 긴급 / 선지급 체크박스 */}
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 cursor-pointer select-none px-3 py-2.5 rounded-xl glass-subtle hover:bg-[rgba(0,0,0,0.03)] transition-colors">
                <input
                  type="checkbox"
                  {...register("isUrgent")}
                  className="size-5 rounded-md border-2 border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] accent-[var(--apple-red)] cursor-pointer transition-colors checked:border-[var(--apple-red)]"
                  aria-describedby="urgent-desc"
                />
                <div>
                  <span className="text-sm font-medium text-[var(--apple-label)]">긴급</span>
                  <p id="urgent-desc" className="text-[12px] text-[var(--apple-secondary-label)]">빠른 처리가 필요한 경우 체크해주세요</p>
                </div>
              </label>
              <Controller
                name="isPrePaid"
                control={control}
                render={({ field }) => (
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none px-3 py-2.5 rounded-xl glass-subtle hover:bg-[rgba(0,0,0,0.03)] transition-colors">
                      <input
                        type="checkbox"
                        checked={field.value ?? false}
                        onChange={(e) => {
                          field.onChange(e.target.checked);
                          if (!e.target.checked) {
                            setValue("prePaidPercentage", null);
                            setPrePaidMode("full");
                          } else {
                            setValue("prePaidPercentage", 100);
                            setPrePaidMode("full");
                          }
                        }}
                        className="size-5 rounded-md border-2 border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] accent-[var(--apple-blue)] cursor-pointer transition-colors checked:border-[var(--apple-blue)]"
                        aria-describedby="prepaid-desc"
                      />
                      <div>
                        <span className="text-sm font-medium text-[var(--apple-label)]">선지급</span>
                        <p id="prepaid-desc" className="text-[12px] text-[var(--apple-secondary-label)]">사전에 지급이 필요한 경우 체크해주세요</p>
                      </div>
                    </label>

                    {watchedIsPrePaid && (
                      <div className="ml-7 space-y-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPrePaidMode("full");
                              setValue("prePaidPercentage", 100);
                            }}
                            className={cn(
                              "px-4 py-2 rounded-full text-sm font-medium transition-all",
                              prePaidMode === "full"
                                ? "bg-[var(--apple-blue)] text-white shadow-sm"
                                : "glass-subtle text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.03)]"
                            )}
                          >
                            전액 (100%)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPrePaidMode("partial");
                              setValue("prePaidPercentage", 50);
                            }}
                            className={cn(
                              "px-4 py-2 rounded-full text-sm font-medium transition-all",
                              prePaidMode === "partial"
                                ? "bg-[var(--apple-blue)] text-white shadow-sm"
                                : "glass-subtle text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.03)]"
                            )}
                          >
                            부분
                          </button>
                        </div>

                        {prePaidMode === "partial" && (
                          <div className="space-y-1.5">
                            <Label htmlFor="prePaidPercentage">선지급 비율</Label>
                            <div className="relative w-32">
                              <Input
                                id="prePaidPercentage"
                                type="number"
                                min={1}
                                max={99}
                                value={watchedPrePaidPercentage ?? 50}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  if (!isNaN(val) && val >= 1 && val <= 99) {
                                    setValue("prePaidPercentage", val);
                                  }
                                }}
                                className="pr-8"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--apple-secondary-label)] pointer-events-none">%</span>
                            </div>
                          </div>
                        )}

                        {supplyAmount > 0 && watchedPrePaidPercentage != null && watchedPrePaidPercentage < 100 && (() => {
                          const totalBeforeWithholding = vatIncluded ? Math.round(supplyAmount * 1.1) : supplyAmount;
                          const withholdingAmount = freelancerDeduction ? Math.round(totalBeforeWithholding * 0.033) : 0;
                          const prePaidAmount = Math.round(totalBeforeWithholding * watchedPrePaidPercentage / 100);
                          const postPaidAmount = totalBeforeWithholding - prePaidAmount - withholdingAmount;
                          return (
                            <div className="px-3 py-2 text-[13px] text-[var(--apple-secondary-label)] space-y-0.5 border border-[rgba(0,0,0,0.06)] rounded-xl">
                              <div className="flex justify-between">
                                <span>총 금액</span>
                                <span>{formatAmount(totalBeforeWithholding)}원</span>
                              </div>
                              <div className="flex justify-between text-[var(--apple-blue)]">
                                <span>선지급금 ({watchedPrePaidPercentage}%)</span>
                                <span>{formatAmount(prePaidAmount)}원</span>
                              </div>
                              {freelancerDeduction && (
                                <div className="flex justify-between text-[var(--apple-red)]">
                                  <span>원천징수 (3.3%)</span>
                                  <span>-{formatAmount(withholdingAmount)}원</span>
                                </div>
                              )}
                              <div className="flex justify-between font-medium text-[var(--apple-label)] pt-1 border-t border-[rgba(0,0,0,0.06)]">
                                <span>후지급금</span>
                                <span>{formatAmount(postPaidAmount)}원</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              />
            </div>

            {/* 카테고리 */}
            <div className="space-y-1.5">
              <Label>
                카테고리 <span className="text-[var(--apple-red)]">*</span>
              </Label>
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {CATEGORY_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            field.onChange(option.value);
                            setShowCustomCategory(false);
                          }}
                          className={cn(
                            "px-4 py-2 rounded-full text-sm font-medium transition-all",
                            field.value === option.value && !showCustomCategory
                              ? "bg-[var(--apple-blue)] text-white shadow-sm"
                              : "glass-subtle text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.03)]"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomCategory(true);
                          field.onChange("");
                        }}
                        className={cn(
                          "px-4 py-2 rounded-full text-sm font-medium transition-all",
                          showCustomCategory
                            ? "bg-[var(--apple-blue)] text-white shadow-sm"
                            : "glass-subtle text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.03)]"
                        )}
                      >
                        + 직접 입력
                      </button>
                    </div>
                    {showCustomCategory && (
                      <Input
                        placeholder="카테고리를 직접 입력하세요"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        aria-invalid={!!errors.category}
                      />
                    )}
                  </div>
                )}
              />
              {errors.category && (
                <p className="text-xs text-[var(--apple-red)]">
                  {errors.category.message}
                </p>
              )}
            </div>

            {/* 설명 */}
            <div className="space-y-1.5">
              <Label htmlFor="description">설명</Label>
              <Textarea
                id="description"
                placeholder="추가 설명을 입력해주세요 (선택사항)"
                rows={3}
                {...register("description")}
              />
              {errors.description && (
                <p className="text-xs text-[var(--apple-red)]">
                  {errors.description.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 입금 정보 */}
        <div className="glass p-6 mt-4">
          <h2 className="text-[15px] font-semibold text-[var(--apple-label)] mb-5">입금 정보</h2>

          <div className="space-y-5">
            {/* 최근 계좌 */}
            {recentAccounts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3.5 text-[var(--apple-secondary-label)]" />
                  <span className="text-[13px] font-medium text-[var(--apple-secondary-label)]">최근 계좌</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {recentAccounts.map((account, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => applyRecentAccount(account)}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl glass-subtle text-left hover:bg-[rgba(0,0,0,0.03)] transition-colors group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] font-medium text-[var(--apple-blue)] shrink-0">{account.bankName}</span>
                        <span className="text-[13px] text-[var(--apple-label)] truncate">{account.accountHolder}</span>
                        <span className="text-[13px] text-[var(--apple-secondary-label)] truncate">{account.accountNumber}</span>
                      </div>
                      <span className="text-[11px] text-[var(--apple-secondary-label)] group-hover:text-[var(--apple-blue)] shrink-0 ml-2">선택</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 은행명 */}
            <div className="space-y-1.5">
              <Label>
                은행명 <span className="text-[var(--apple-red)]">*</span>
              </Label>
              <Controller
                name="bankName"
                control={control}
                render={({ field }) => (
                  <Popover open={bankOpen} onOpenChange={setBankOpen}>
                    <PopoverTrigger
                      className={cn(
                        "flex h-10 w-full items-center justify-between rounded-xl border border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)] px-3 text-sm transition-colors hover:bg-[rgba(0,0,0,0.03)]",
                        !field.value && "text-[var(--apple-secondary-label)]",
                        errors.bankName && "border-[var(--apple-red)] ring-2 ring-[rgba(255,59,48,0.2)]"
                      )}
                    >
                      {field.value || "은행 선택"}
                      <ChevronsUpDown className="size-4 text-[var(--apple-secondary-label)] shrink-0" />
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="은행 검색..." />
                        <CommandList>
                          <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
                          <CommandGroup>
                            {BANK_LIST.map((bank) => (
                              <CommandItem
                                key={bank}
                                value={bank}
                                onSelect={() => {
                                  field.onChange(bank);
                                  setBankOpen(false);
                                }}
                                data-checked={field.value === bank}
                              >
                                {bank}
                                {field.value === bank && (
                                  <Check className="ml-auto size-4 text-[var(--apple-blue)]" />
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              />
              {errors.bankName && (
                <p className="text-xs text-[var(--apple-red)]">
                  {errors.bankName.message}
                </p>
              )}
            </div>

            {/* 예금주 */}
            <div className="space-y-1.5">
              <Label htmlFor="accountHolder">
                예금주 <span className="text-[var(--apple-red)]">*</span>
              </Label>
              <Input
                id="accountHolder"
                placeholder="예: 홍길동"
                aria-invalid={!!errors.accountHolder}
                {...register("accountHolder")}
              />
              {errors.accountHolder && (
                <p className="text-xs text-[var(--apple-red)]">
                  {errors.accountHolder.message}
                </p>
              )}
            </div>

            {/* 계좌번호 */}
            <div className="space-y-1.5">
              <Label htmlFor="accountNumber">
                계좌번호 <span className="text-[var(--apple-red)]">*</span>
              </Label>
              <Input
                id="accountNumber"
                placeholder="숫자만 입력"
                inputMode="numeric"
                aria-invalid={!!errors.accountNumber}
                {...register("accountNumber", {
                  onChange: (e) => {
                    e.target.value = e.target.value.replace(/[^\d]/g, "");
                  },
                })}
              />
              {errors.accountNumber && (
                <p className="text-xs text-[var(--apple-red)]">
                  {errors.accountNumber.message}
                </p>
              )}
            </div>

          </div>
        </div>

        {/* 파일 첨부 (필수) */}
        <div className="glass p-6 mt-4">
          <h2 className="text-[15px] font-semibold text-[var(--apple-label)] mb-1">
            파일 첨부 <span className="text-[var(--apple-red)]">*</span>
          </h2>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mb-4">
            증빙서류를 첨부해주세요. 최소 1개의 파일과 문서 유형 선택이 필요합니다.
          </p>
          <FileUploadWithDocType
            files={files}
            onFilesChange={(newFiles) => {
              setFiles(newFiles);
              if (newFiles.length > 0) {
                setFileError(null);
              }
            }}
            onDocumentTypeChange={handleDocumentTypeChange}
            documentTypeErrors={docTypeErrors}
            error={fileError ?? undefined}
          />
        </div>

        {/* 버튼 */}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end sticky bottom-4 sm:static z-10 bg-[var(--background)]/80 backdrop-blur-md sm:bg-transparent sm:backdrop-blur-none p-3 -mx-3 sm:mx-0 sm:p-0 rounded-2xl sm:rounded-none">
          <Link href="/expenses" className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full rounded-full h-11 glass border-[var(--apple-separator)]">
              취소
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto rounded-full h-11 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                제출 중...
              </>
            ) : (
              "제출하기"
            )}
          </Button>
        </div>
      </form>

      <SubmitSuccessDialog
        open={showSuccess}
        newSubmitPath="/expenses/new"
        title="제출 완료"
        description="입금요청이 정상적으로 제출되었습니다. 관리자 승인을 기다려주세요."
      />
    </div>
  );
}
