"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { FileUpload } from "@/components/forms/file-upload";
import dynamic from "next/dynamic";
const SubmitSuccessDialog = dynamic(() => import("@/components/forms/submit-success-dialog").then(m => m.SubmitSuccessDialog), { ssr: false });
import {
  corporateCardFormSchema,
  type CorporateCardFormData,
  type FileWithPreview,
  CATEGORY_OPTIONS,
  formatAmount,
  formatDateISO,
} from "@/lib/validations/expense-form";
import { cn } from "@/lib/utils";

export default function CorporateCardPage() {
  const router = useRouter();
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [amountDisplay, setAmountDisplay] = useState("");
  const [showCustomCategory, setShowCustomCategory] = useState(false);

  // VAT / 프리랜서 원천징수
  const [vatIncluded, setVatIncluded] = useState(false);
  const [freelancerDeduction, setFreelancerDeduction] = useState(false);
  const [supplyAmount, setSupplyAmount] = useState(0);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<CorporateCardFormData>({
    resolver: zodResolver(corporateCardFormSchema),
    defaultValues: {
      title: "",
      merchantName: "",
      description: "",
      isUrgent: false,
    },
  });

  // 금액 계산 로직
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
      setValue("amount", calcFinalAmount(num, vatIncluded, freelancerDeduction), {
        shouldValidate: true,
      });
    },
    [setValue, vatIncluded, freelancerDeduction, calcFinalAmount]
  );

  const handleVatToggle = useCallback(
    (checked: boolean) => {
      setVatIncluded(checked);
      if (supplyAmount > 0) {
        setValue(
          "amount",
          calcFinalAmount(supplyAmount, checked, freelancerDeduction),
          { shouldValidate: true }
        );
      }
    },
    [setValue, supplyAmount, freelancerDeduction, calcFinalAmount]
  );

  const handleFreelancerToggle = useCallback(
    (checked: boolean) => {
      setFreelancerDeduction(checked);
      if (supplyAmount > 0) {
        setValue(
          "amount",
          calcFinalAmount(supplyAmount, vatIncluded, checked),
          { shouldValidate: true }
        );
      }
    },
    [setValue, supplyAmount, vatIncluded, calcFinalAmount]
  );

  const onValidationError = (fieldErrors: Record<string, unknown>) => {
    const fieldNames: Record<string, string> = {
      title: "제목",
      amount: "금액",
      category: "카테고리",
      merchantName: "가맹점명",
      description: "설명",
    };
    const messages = Object.entries(fieldErrors)
      .map(([key, err]) => {
        const label = fieldNames[key] || key;
        const msg = (err as { message?: string })?.message || "입력 오류";
        return `${label}: ${msg}`;
      });
    const errorMsg = messages[0] || "입력값을 확인해주세요.";
    console.error("[법카폼 검증실패]", JSON.stringify(fieldErrors));
    toast.error(errorMsg);
  };

  const onSubmit = async (data: CorporateCardFormData) => {
    console.log("[법카폼] onSubmit 호출됨", JSON.stringify(data));
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CORPORATE_CARD",
          title: data.title,
          description: data.description || null,
          amount: data.amount,
          category: data.category,
          merchantName: data.merchantName || undefined,
          transactionDate: formatDateISO(new Date()),
          isUrgent: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error?.message || "비용 제출에 실패했습니다."
        );
      }

      const result = await response.json();
      const expenseId = result.data?.id;

      // Upload attachments in parallel
      if (files.length > 0 && expenseId) {
        await Promise.all(
          files.map((fileItem) => {
            const formData = new FormData();
            formData.append("file", fileItem.file);
            formData.append("expenseId", expenseId);
            formData.append("documentType", fileItem.documentType || "OTHER");
            return fetch("/api/attachments/upload", { method: "POST", body: formData });
          })
        );
      }

      setShowSuccess(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "비용 제출에 실패했습니다."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 최종 금액 계산
  const finalAmount = supplyAmount > 0
    ? calcFinalAmount(supplyAmount, vatIncluded, freelancerDeduction)
    : 0;
  const vatAmount = vatIncluded ? Math.round(supplyAmount * 0.1) : 0;
  const freelancerAmount = freelancerDeduction
    ? Math.round((supplyAmount + vatAmount) * 0.033)
    : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/expenses/new"
          className="flex items-center justify-center size-11 rounded-full glass-subtle text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">
            법카사용 내역 작성
          </h1>
          <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">
            법인카드 사용내역을 입력해주세요. 제출 시 자동 승인됩니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onValidationError)} noValidate>
        <div className="glass p-6">
          <h2 className="text-[15px] font-semibold text-[var(--apple-label)] mb-1">
            기본 정보
          </h2>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mb-5">
            <span className="text-[#FF3B30]">*</span> 필수 항목
          </p>

          <div className="space-y-5">
            {/* 제목 */}
            <div className="space-y-1.5">
              <Label htmlFor="title">
                제목 <span className="text-[#FF3B30]">*</span>
              </Label>
              <Input
                id="title"
                placeholder="예: 3월 사무용품 구매"
                aria-invalid={!!errors.title}
                {...register("title")}
              />
              {errors.title && (
                <p className="text-xs text-[#FF3B30]">
                  {errors.title.message}
                </p>
              )}
            </div>

            {/* 금액 */}
            <div className="space-y-1.5">
              <Label htmlFor="amount">
                금액 <span className="text-[#FF3B30]">*</span>
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
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--apple-secondary-label)] pointer-events-none">
                  원
                </span>
              </div>

              {/* VAT + 프리랜서 원천징수 체크박스 */}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={vatIncluded}
                    onChange={(e) => handleVatToggle(e.target.checked)}
                    className="size-4 rounded border-[rgba(0,0,0,0.15)] text-[#007AFF] focus:ring-[#007AFF] cursor-pointer"
                  />
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">
                    VAT 포함 (+10%)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={freelancerDeduction}
                    onChange={(e) => handleFreelancerToggle(e.target.checked)}
                    className="size-4 rounded border-[rgba(0,0,0,0.15)] text-[#007AFF] focus:ring-[#007AFF] cursor-pointer"
                  />
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">
                    프리랜서 원천징수 (-3.3%)
                  </span>
                </label>
              </div>

              {/* 금액 내역 */}
              {supplyAmount > 0 && (vatIncluded || freelancerDeduction) && (
                <div className="mt-2 p-3 rounded-lg bg-[rgba(0,122,255,0.06)] text-[13px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[var(--apple-secondary-label)]">공급가액</span>
                    <span>{formatAmount(supplyAmount)}원</span>
                  </div>
                  {vatIncluded && (
                    <div className="flex justify-between">
                      <span className="text-[var(--apple-secondary-label)]">
                        VAT (+10%)
                      </span>
                      <span>+{formatAmount(vatAmount)}원</span>
                    </div>
                  )}
                  {freelancerDeduction && (
                    <div className="flex justify-between">
                      <span className="text-[var(--apple-secondary-label)]">
                        원천징수 (-3.3%)
                      </span>
                      <span className="text-[#FF3B30]">
                        -{formatAmount(freelancerAmount)}원
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t border-[rgba(0,0,0,0.08)] pt-1 mt-1">
                    <span>실지급액</span>
                    <span className="text-[#007AFF]">
                      {formatAmount(finalAmount)}원
                    </span>
                  </div>
                </div>
              )}

              {errors.amount && (
                <p className="text-xs text-[#FF3B30]">
                  {errors.amount.message}
                </p>
              )}
            </div>

            {/* 카테고리 — 버튼 토글 + 직접 입력 */}
            <div className="space-y-1.5">
              <Label>
                카테고리 <span className="text-[#FF3B30]">*</span>
              </Label>
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {CATEGORY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            field.onChange(opt.value);
                            setShowCustomCategory(false);
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors border",
                            field.value === opt.value && !showCustomCategory
                              ? "bg-[#007AFF] text-white border-[#007AFF]"
                              : "glass-subtle border-[var(--apple-separator)] text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.03)]"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomCategory(true);
                          field.onChange("");
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors border",
                          showCustomCategory
                            ? "bg-[#007AFF] text-white border-[#007AFF]"
                            : "glass-subtle border-[var(--apple-separator)] text-[var(--apple-secondary-label)] hover:bg-[rgba(0,0,0,0.03)]"
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
                        className="mt-1"
                      />
                    )}
                  </div>
                )}
              />
              {errors.category && (
                <p className="text-xs text-[#FF3B30]">
                  {errors.category.message}
                </p>
              )}
            </div>

            {/* 가맹점명 */}
            <div className="space-y-1.5">
              <Label htmlFor="merchantName">가맹점명</Label>
              <Input
                id="merchantName"
                placeholder="예: 교보문고"
                {...register("merchantName")}
              />
              {errors.merchantName && (
                <p className="text-xs text-[#FF3B30]">
                  {errors.merchantName.message}
                </p>
              )}
            </div>

            {/* 거래일 — onSubmit에서 new Date()로 직접 설정 */}

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
                <p className="text-xs text-[#FF3B30]">
                  {errors.description.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 파일 첨부 */}
        <div className="glass p-6 mt-4">
          <h2 className="text-[15px] font-semibold text-[var(--apple-label)] mb-1">
            파일 첨부
          </h2>
          <p className="text-[13px] text-[var(--apple-secondary-label)] mb-4">
            영수증 등 증빙자료를 첨부해주세요. (선택사항)
          </p>
          <FileUpload files={files} onFilesChange={setFiles} />
        </div>

        {/* 버튼 */}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link href="/expenses" className="w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full h-11 glass border-[var(--apple-separator)]"
            >
              취소
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto rounded-full h-11 bg-[#007AFF] hover:bg-[#0066d6]"
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
        description="법카사용 내역이 정상적으로 제출되었습니다."
      />
    </div>
  );
}
