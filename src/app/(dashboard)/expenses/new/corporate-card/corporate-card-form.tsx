"use client";

import React, { useState, useCallback, useEffect } from "react";
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

import { CompanySelector } from "@/components/forms/company-selector";
import dynamic from "next/dynamic";
const SubmitSuccessDialog = dynamic(() => import("@/components/forms/submit-success-dialog").then(m => m.SubmitSuccessDialog), { ssr: false });
import {
  corporateCardFormSchema,
  type CorporateCardFormData,
  CATEGORY_OPTIONS,
  formatAmount,
  formatAmountUSD,
  parseAmountUSD,
  dollarsToCents,
  formatDateISO,
} from "@/lib/validations/expense-form";
import { cn } from "@/lib/utils";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { Breadcrumb } from "@/components/layout/breadcrumb";

interface CorporateCardFormProps {
  initialCompanies?: { id: string; name: string; slug: string; currency: string }[];
  prefillData?: {
    amount: number;
    merchantName: string | null;
    transactionDate: string;
    gowidTxId: string;
  };
}

export default function CorporateCardForm({ initialCompanies, prefillData }: CorporateCardFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [amountDisplay, setAmountDisplay] = useState("");
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [showCustomMerchant, setShowCustomMerchant] = useState(false);

  // Company selection
  const [companyId, setCompanyId] = useState("");
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [currency, setCurrency] = useState("KRW");

  // Exchange rate for USD
  const [exchangeRate, setExchangeRate] = useState<{ rate: number; date: string } | null>(null);
  const [exchangeRateLoading, setExchangeRateLoading] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.ok ? res.json() : null)
      .then((json) => {
        const cid = json?.data?.companyId;
        if (cid) {
          setUserCompanyId(cid);
          setCompanyId(cid);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch exchange rate when currency is USD
  useEffect(() => {
    if (currency !== "USD") {
      setExchangeRate(null);
      return;
    }
    let cancelled = false;
    setExchangeRateLoading(true);
    fetch("/api/exchange-rate?currency=USD")
      .then((res) => res.ok ? res.json() : null)
      .then((json) => {
        if (!cancelled && json?.rate) {
          setExchangeRate({ rate: json.rate, date: json.date ?? "" });
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setExchangeRateLoading(false); });
    return () => { cancelled = true; };
  }, [currency]);

  // VAT / 프리랜서 원천징수
  const [vatIncluded, setVatIncluded] = useState(false);
  const [freelancerDeduction, setFreelancerDeduction] = useState(false);
  const [supplyAmount, setSupplyAmount] = useState(0);

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
      title: "",
      merchantName: "",
      description: "",
      isUrgent: false,
    },
  });

  // Warn on unsaved changes (browser close / refresh)
  useUnsavedChanges(isDirty);

  // Pre-fill fields from GoWid transaction
  useEffect(() => {
    if (!prefillData) return;
    setAmountDisplay(formatAmount(prefillData.amount));
    setSupplyAmount(prefillData.amount);
    setValue("amount", prefillData.amount, { shouldValidate: true });
    if (prefillData.merchantName) {
      setValue("merchantName", prefillData.merchantName);
      setShowCustomMerchant(true);
    }
  }, [prefillData, setValue]);

  // Handle company change — only update companyId (currency is independent)
  const handleCompanyChange = useCallback((newCompanyId: string, _newCurrency?: string) => {
    void _newCurrency;
    setCompanyId(newCompanyId);
  }, []);

  // Handle currency toggle — reset amount when currency changes
  const handleCurrencyChange = useCallback((newCurrency: string) => {
    if (newCurrency === currency) return;
    setCurrency(newCurrency);
    setAmountDisplay("");
    setSupplyAmount(0);
    setValue("amount", 0, { shouldValidate: false });
  }, [currency, setValue]);

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
      if (currency === "USD") {
        const raw = e.target.value.replace(/[^0-9.]/g, "");
        // Prevent multiple decimal points
        const parts = raw.split(".");
        const sanitized = parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : raw;
        // Limit to 2 decimal places
        const [intPart, decPart] = sanitized.split(".");
        const limited = decPart !== undefined ? intPart + "." + decPart.slice(0, 2) : sanitized;

        if (limited === "" || limited === ".") {
          setAmountDisplay("");
          setSupplyAmount(0);
          setValue("amount", 0, { shouldValidate: true });
          return;
        }
        const num = parseAmountUSD(limited);
        setSupplyAmount(num);
        setAmountDisplay(limited);
        setValue("amount", dollarsToCents(num), { shouldValidate: true });
        return;
      }

      // KRW flow (unchanged)
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
    [setValue, vatIncluded, freelancerDeduction, calcFinalAmount, currency]
  );

  const handleVatToggle = useCallback(
    (checked: boolean) => {
      setVatIncluded(checked);
      // For USD, form amount stays as cents — VAT/deduction are KRW display only
      if (currency === "USD" || supplyAmount <= 0) return;
      setValue(
        "amount",
        calcFinalAmount(supplyAmount, checked, freelancerDeduction),
        { shouldValidate: true }
      );
    },
    [setValue, supplyAmount, freelancerDeduction, calcFinalAmount, currency]
  );

  const handleFreelancerToggle = useCallback(
    (checked: boolean) => {
      setFreelancerDeduction(checked);
      // For USD, form amount stays as cents — VAT/deduction are KRW display only
      if (currency === "USD" || supplyAmount <= 0) return;
      setValue(
        "amount",
        calcFinalAmount(supplyAmount, vatIncluded, checked),
        { shouldValidate: true }
      );
    },
    [setValue, supplyAmount, vatIncluded, calcFinalAmount, currency]
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
    toast.error(errorMsg);
  };

  const onSubmit = async (data: CorporateCardFormData) => {
    setIsSubmitting(true);

    try {
      const url = prefillData?.gowidTxId ? `/api/expenses?gowidTxId=${prefillData.gowidTxId}` : "/api/expenses";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CORPORATE_CARD",
          title: data.title,
          description: data.description || null,
          amount: data.amount,
          currency: currency,
          category: data.category,
          merchantName: data.merchantName || undefined,
          transactionDate: prefillData?.transactionDate ?? formatDateISO(new Date()),
          isUrgent: false,
          companyId: companyId || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error?.message || "비용 제출에 실패했습니다."
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
  // For USD, VAT/deduction are applied to the KRW-converted amount (display only)
  const krwBase = currency === "USD" && exchangeRate
    ? Math.round(supplyAmount * exchangeRate.rate)
    : supplyAmount;
  const finalAmount = krwBase > 0
    ? calcFinalAmount(krwBase, vatIncluded, freelancerDeduction)
    : 0;
  const vatAmount = vatIncluded ? Math.round(krwBase * 0.1) : 0;
  const freelancerAmount = freelancerDeduction
    ? Math.round((krwBase + vatAmount) * 0.033)
    : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Breadcrumb (desktop) */}
      <Breadcrumb items={[
        { label: "비용 관리", href: "/expenses" },
        { label: "새 비용", href: "/expenses/new" },
        { label: "법카사용 작성" },
      ]} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/expenses/new"
          className="flex items-center justify-center size-11 rounded-full glass-subtle text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">
            법카사용 내역 작성
          </h1>
          <p className="text-footnote text-[var(--apple-secondary-label)] mt-0.5">
            법인카드 사용내역을 입력해주세요. 제출 시 자동 승인됩니다.
          </p>
        </div>
      </div>

      {prefillData && (
        <div className="p-3 rounded-xl bg-[rgba(0,122,255,0.08)] border border-[rgba(0,122,255,0.15)]">
          <p className="text-[13px] text-[var(--apple-blue)]">
            고위드에서 가져온 거래 정보가 자동 입력되었습니다.
            제목과 카테고리를 선택한 뒤 제출해주세요.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit, onValidationError)} noValidate>
        <div className="glass p-6">
          <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-1">
            기본 정보
          </h2>
          <p className="text-footnote text-[var(--apple-secondary-label)] mb-5">
            <span className="text-[var(--apple-red)]">*</span> 필수 항목
          </p>

          <div className="space-y-5">
            {/* 회사 선택 */}
            <CompanySelector
              value={companyId}
              onChange={handleCompanyChange}
              userCompanyId={userCompanyId}
              initialCompanies={initialCompanies}
            />

            {/* 제목 */}
            <div className="space-y-1.5">
              <Label htmlFor="title">
                제목 <span className="text-[var(--apple-red)]">*</span>
              </Label>
              <Input
                id="title"
                placeholder="예: 사무용품 구매, 회의 다과 등"
                {...register("title")}
                aria-invalid={!!errors.title}
              />
              {errors.title && (
                <p className="text-xs text-[var(--apple-red)]">
                  {errors.title.message}
                </p>
              )}
            </div>

            {/* 카테고리 — 버튼 토글 + 직접 입력 */}
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
                              ? "bg-[var(--apple-blue)] text-white border-[var(--apple-blue)]"
                              : "glass-subtle border-[var(--apple-separator)] text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]"
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
                            ? "bg-[var(--apple-blue)] text-white border-[var(--apple-blue)]"
                            : "glass-subtle border-[var(--apple-separator)] text-[var(--apple-secondary-label)] hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]"
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
                <p className="text-xs text-[var(--apple-red)]">
                  {errors.category.message}
                </p>
              )}
            </div>

            {/* 가맹점명 — GoWid prefill 시 읽기전용, 아니면 버튼 토글 + 직접 입력 */}
            <div className="space-y-1.5">
              <Label>가맹점명</Label>
              {prefillData?.merchantName ? (
                <Input
                  value={prefillData.merchantName}
                  readOnly
                  className="bg-[var(--apple-system-grouped-background)] text-[var(--apple-label)]"
                />
              ) : (
              <Controller
                name="merchantName"
                control={control}
                render={({ field }) => (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {[
                        { value: "쿠팡", label: "쿠팡" },
                        { value: "네이버", label: "네이버" },
                        { value: "기타", label: "기타" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            field.onChange(opt.value);
                            setShowCustomMerchant(false);
                          }}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors border",
                            field.value === opt.value && !showCustomMerchant
                              ? "bg-[var(--apple-blue)] text-white border-[var(--apple-blue)]"
                              : "glass-subtle border-[var(--apple-separator)] text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomMerchant(true);
                          field.onChange("");
                        }}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors border",
                          showCustomMerchant
                            ? "bg-[var(--apple-blue)] text-white border-[var(--apple-blue)]"
                            : "glass-subtle border-[var(--apple-separator)] text-[var(--apple-secondary-label)] hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]"
                        )}
                      >
                        + 직접 입력
                      </button>
                    </div>
                    {showCustomMerchant && (
                      <Input
                        placeholder="가맹점명을 직접 입력하세요"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="mt-1"
                      />
                    )}
                  </div>
                )}
              />
              )}
              {errors.merchantName && (
                <p className="text-xs text-[var(--apple-red)]">
                  {errors.merchantName.message}
                </p>
              )}
            </div>

            {/* 금액 */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="amount">
                  금액 <span className="text-[var(--apple-red)]">*</span>
                </Label>
                {/* Currency toggle — KRW/USD */}
                <div
                  className={cn(
                    "inline-flex p-0.5 rounded-full",
                    "bg-[var(--apple-system-grouped-background)]",
                    "border border-[var(--glass-border)]"
                  )}
                  role="radiogroup"
                  aria-label="통화 선택"
                >
                  {[
                    { value: "KRW", label: "원화 ₩" },
                    { value: "USD", label: "달러 $" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={currency === opt.value}
                      onClick={() => handleCurrencyChange(opt.value)}
                      className={cn(
                        "px-3 py-1 text-[12px] font-medium rounded-full transition-all duration-200 whitespace-nowrap",
                        currency === opt.value
                          ? "bg-[var(--apple-blue)] text-white shadow-[0_1px_4px_rgba(0,122,255,0.25)]"
                          : "text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                {currency === "USD" && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--apple-secondary-label)] pointer-events-none">
                    $
                  </span>
                )}
                <Input
                  id="amount"
                  placeholder="0"
                  inputMode={currency === "USD" ? "decimal" : "numeric"}
                  value={amountDisplay}
                  onChange={handleAmountChange}
                  aria-invalid={!!errors.amount}
                  className={currency === "USD" ? "pl-7 pr-4" : "pr-10"}
                />
                {currency !== "USD" && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--apple-secondary-label)] pointer-events-none">
                    원
                  </span>
                )}
              </div>

              {/* USD exchange rate info */}
              {currency === "USD" && (
                <div className="mt-1.5 space-y-1 text-[13px]">
                  {exchangeRateLoading ? (
                    <p className="text-[var(--apple-secondary-label)]">환율 정보 불러오는 중...</p>
                  ) : exchangeRate ? (
                    <>
                      <p className="text-[var(--apple-secondary-label)]">
                        적용 환율: 1 USD = {formatAmount(exchangeRate.rate)}원
                        {exchangeRate.date && ` (${exchangeRate.date} 기준)`}
                      </p>
                      {supplyAmount > 0 && (
                        <p className="text-[var(--apple-blue)] font-medium">
                          → ₩{formatAmount(Math.round(supplyAmount * exchangeRate.rate))}
                        </p>
                      )}
                    </>
                  ) : null}
                </div>
              )}

              {/* VAT + 프리랜서 원천징수 체크박스 */}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={vatIncluded}
                    onChange={(e) => handleVatToggle(e.target.checked)}
                    className="size-4 rounded border-[rgba(0,0,0,0.15)] dark:border-[rgba(255,255,255,0.2)] text-[var(--apple-blue)] focus:ring-[var(--apple-blue)] cursor-pointer"
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
                    className="size-4 rounded border-[rgba(0,0,0,0.15)] dark:border-[rgba(255,255,255,0.2)] text-[var(--apple-blue)] focus:ring-[var(--apple-blue)] cursor-pointer"
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
                    <span>
                      {currency === "USD" ? (
                        <>
                          ${formatAmountUSD(supplyAmount)}
                          {exchangeRate && (
                            <span className="text-[var(--apple-secondary-label)]"> (₩{formatAmount(krwBase)})</span>
                          )}
                        </>
                      ) : (
                        <>{formatAmount(supplyAmount)}원</>
                      )}
                    </span>
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
                      <span className="text-[var(--apple-red)]">
                        -{formatAmount(freelancerAmount)}원
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold border-t border-[rgba(0,0,0,0.08)] dark:border-[rgba(255,255,255,0.1)] pt-1 mt-1">
                    <span>실지급액</span>
                    <span className="text-[var(--apple-blue)]">
                      {formatAmount(finalAmount)}원
                    </span>
                  </div>
                </div>
              )}

              {errors.amount && (
                <p className="text-xs text-[var(--apple-red)]">
                  {errors.amount.message}
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
                <p className="text-xs text-[var(--apple-red)]">
                  {errors.description.message}
                </p>
              )}
            </div>
          </div>
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
            className="w-full sm:w-auto rounded-full h-12 px-8 text-[15px] font-semibold bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] shadow-[0_4px_14px_rgba(0,122,255,0.4)] hover:shadow-[0_6px_20px_rgba(0,122,255,0.5)] transition-all"
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
