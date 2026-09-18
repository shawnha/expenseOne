"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  ChevronsUpDown,
  Check,
  Clock,
  CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { FileUploadWithDocType } from "@/components/forms/file-upload";
import {
  PurchaseFields,
  emptyPurchaseFields,
  toPurchasePayload,
  type PurchaseFieldValues,
} from "@/components/forms/purchase-fields";
import { VatModeSelect } from "@/components/forms/vat-mode-select";
import { BranchSelectField, shouldAskBranch } from "@/components/forms/branch-select-field";
import { CategorySelectField } from "@/components/forms/category-select-field";
import type { PayeeSuggestion } from "@/services/autofill.service";
import { accountKey, holderKey } from "@/lib/utils/autofill";
import { getCategoryLabel } from "@/lib/utils/expense-utils";
import { CompanySelector } from "@/components/forms/company-selector";
import dynamic from "next/dynamic";
const SubmitSuccessDialog = dynamic(() => import("@/components/forms/submit-success-dialog").then(m => m.SubmitSuccessDialog), { ssr: false });
import {
  depositRequestFormSchema,
  type DepositRequestFormData,
  type FileWithPreview,
  formatAmount,
  formatAmountUSD,
  parseAmountUSD,
  formatDateISO,
} from "@/lib/validations/expense-form";
import { calcDepositAmount, calcDepositBreakdownKRW } from "@/lib/utils/deposit-amount";
import { countUploadFailures, uploadFailureMessage } from "@/lib/utils/upload-results";
import { resolveCreatedExpenseId } from "@/lib/utils/submit-result";
import type { DocumentType } from "@/types";
import { cn } from "@/lib/utils";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useFormBusy } from "@/hooks/use-form-busy";
import { Breadcrumb } from "@/components/layout/breadcrumb";

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

interface DepositRequestFormProps {
  initialCompanies?: { id: string; name: string; slug: string; currency: string }[];
  /** 본인이 예전에 직접 입력한 카테고리 (최근순). */
  myCategories?: string[];
  /**
   * 내가 예전에 보낸 계좌 (최근순, 서버 기록). 예전엔 localStorage에 5개만 두어서
   * 폰 PWA와 PC가 따로 놀았고 새 기기에선 비어 있었다.
   */
  myPayees?: PayeeSuggestion[];
}

export default function DepositRequestForm({ initialCompanies, myCategories = [], myPayees = [] }: DepositRequestFormProps) {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amountDisplay, setAmountDisplay] = useState("");
  // 금액은 RHF register가 아니라 setValue(shouldDirty 없음)로 쓰므로 isDirty가 안 켜진다.
  // 금액만 입력한 폼도 "작성 중"으로 보려면 따로 표시해야 한다.
  const [amountTouched, setAmountTouched] = useState(false);
  const [vatIncluded, setVatIncluded] = useState(false);
  const [freelancerDeduction, setFreelancerDeduction] = useState(false);
  const [purchase, setPurchase] = useState<PurchaseFieldValues>(emptyPurchaseFields);
  const [branch, setBranch] = useState<string | null>(null);

  const [supplyAmount, setSupplyAmount] = useState(0);
  const [bankOpen, setBankOpen] = useState(false);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  // 비용은 만들어졌는데 첨부 업로드가 실패한 경우 — 성공 창에서 상세로 안내한다.
  const [uploadIssue, setUploadIssue] = useState<{ message: string; detailHref: string | null } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [docTypeErrors, setDocTypeErrors] = useState<Record<string, boolean>>(
    {}
  );

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
          // 응답이 오기 전에 사용자가 회사를 눌렀거나 지난번 계좌로 회사가
          // 채워졌으면 덮어쓰지 않는다. 비어 있을 때만 기본값을 넣는다.
          setCompanyId((prev) => prev || cid);
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

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    watch,
    formState: { errors, isDirty },
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
      dueDate: null,
    },
  });

  // 호점은 **리테일의 마트/약국**일 때만 묻는다. 회사 slug는 서버가 내려준
  // 목록에서 찾는다(선택값은 id뿐이라 slug를 따로 들고 있지 않다).
  const selectedCompanySlug =
    initialCompanies?.find((c) => c.id === companyId)?.slug ?? null;
  const askBranch = shouldAskBranch(selectedCompanySlug, watch("category"));

  // Handle company change — only update companyId (currency is independent)
  // 사용자가 회사를 **직접 눌렀는지**. 눌렀으면 계좌를 불러와도 회사는 건드리지
  // 않는다(CompanySelector는 사용자가 누를 때만 onChange를 부른다).
  const companyTouchedRef = useRef(false);
  const handleCompanyChange = useCallback((newCompanyId: string, _newCurrency?: string) => {
    void _newCurrency;
    companyTouchedRef.current = true;
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

  // Warn on unsaved changes (browser close / refresh)
  useUnsavedChanges(isDirty || files.length > 0);
  // 작성·제출 중엔 새 배포의 강제 새로고침을 미룬다 (sw-update-prompt)
  useFormBusy("deposit-request", isDirty || files.length > 0 || amountTouched || isSubmitting);

  const watchedIsPrePaid = watch("isPrePaid");
  const watchedPrePaidPercentage = watch("prePaidPercentage");
  const [prePaidMode, setPrePaidMode] = useState<"full" | "partial">("full");

  // 지난번 계좌 불러오기. 채우는 칸은 데이터로 정했다(autofill.service 참고):
  // 계좌·은행은 항상, 카테고리는 **비어 있을 때만**, 회사는 **직접 고르지 않았을
  // 때만**. 제목·금액은 절대 채우지 않는다 — 재제출 중 금액이 같은 건 8%뿐이다.
  const applyPayee = useCallback(
    (p: PayeeSuggestion) => {
      const opts = { shouldValidate: true, shouldDirty: true } as const;
      setValue("bankName", p.bankName, opts);
      setValue("accountHolder", p.accountHolder, opts);
      setValue("accountNumber", accountKey(p.accountNumber), opts);

      const filled = ["계좌"];
      if (!getValues("category")?.trim() && p.category) {
        setValue("category", p.category, opts);
        filled.push("카테고리");
      }
      if (
        !companyTouchedRef.current &&
        p.companyId &&
        p.companyId !== companyId &&
        initialCompanies?.some((c) => c.id === p.companyId)
      ) {
        setCompanyId(p.companyId);
        filled.push("회사");
      }
      toast.success(`지난번 ${filled.join("·")} 정보를 채웠습니다. 금액은 직접 입력해주세요.`);
    },
    [setValue, getValues, companyId, initialCompanies]
  );

  // 예금주를 직접 쳤는데 예전에 보낸 적 있는 사람이면, 지난번 계좌를 제안한다.
  // 이미 그 계좌가 들어 있으면 제안하지 않는다.
  const typedHolder = watch("accountHolder");
  const typedAccount = watch("accountNumber");
  const typedBank = watch("bankName");
  //
  // 한 예금주에게 계좌가 여럿인 경우가 실제로 있다(같은 이름에 계좌 3~4개).
  // 지금 입력된 계좌가 그중 **어느 하나와** 같으면 이미 채워진 것으로 본다 —
  // 첫 번째 것만 보면 오래된 계좌를 골랐을 때 최신 계좌로 바꾸라고 조르고,
  // 누르면 계좌와 회사가 엉뚱하게 바뀐다.
  const sameHolder = typedHolder?.trim()
    ? myPayees.filter((p) => holderKey(p.accountHolder) === holderKey(typedHolder))
    : [];
  const exactPayee = sameHolder.find(
    (p) => p.bankName === typedBank && accountKey(p.accountNumber) === accountKey(typedAccount)
  );
  const holderMatch = exactPayee ?? sameHolder[0];
  const holderMatchApplied = !!exactPayee;

  // 지금 입력된 계좌가 예전 계좌와 같으면, 그때 카테고리를 추천한다.
  const payeeForCategory = holderMatchApplied ? holderMatch : undefined;
  const categorySuggestion = payeeForCategory
    ? { category: payeeForCategory.category, from: payeeForCategory.accountHolder }
    : null;

  // amount 필드 = KRW 원 / USD 센트. 부가세·원천징수 배율은 통화별 최소 단위로
  // 바꾼 뒤 적용한다 — 예전엔 토글이 달러 값에 배율만 곱해 100분의 1로 저장됐다.
  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setAmountTouched(true);
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
        setValue("amount", calcDepositAmount(num, "USD", vatIncluded, freelancerDeduction), { shouldValidate: true });
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
      setValue("amount", calcDepositAmount(num, "KRW", vatIncluded, freelancerDeduction), { shouldValidate: true });
    },
    [setValue, vatIncluded, freelancerDeduction, currency]
  );

  const handleVatToggle = useCallback(
    (checked: boolean) => {
      setVatIncluded(checked);
      if (supplyAmount > 0) {
        setValue("amount", calcDepositAmount(supplyAmount, currency, checked, freelancerDeduction), { shouldValidate: true });
      }
    },
    [setValue, supplyAmount, freelancerDeduction, currency]
  );

  const handleFreelancerToggle = useCallback(
    (checked: boolean) => {
      setFreelancerDeduction(checked);
      if (supplyAmount > 0) {
        setValue("amount", calcDepositAmount(supplyAmount, currency, vatIncluded, checked), { shouldValidate: true });
      }
    },
    [setValue, supplyAmount, vatIncluded, currency]
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
          currency,
          category: data.category,
          bankName: data.bankName,
          accountHolder: data.accountHolder,
          accountNumber: data.accountNumber,
          transactionDate: formatDateISO(new Date()),
          isUrgent: data.isUrgent || false,
          isPrePaid: data.isPrePaid || false,
          prePaidPercentage: data.prePaidPercentage ?? null,
          dueDate: data.dueDate ? formatDateISO(data.dueDate) : null,
          companyId: companyId || undefined,
          hasFreelancerWithholding: freelancerDeduction,
          ...toPurchasePayload(purchase),
          branch: askBranch ? branch : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error?.message || "입금요청 제출에 실패했습니다."
        );
      }

      // 리다이렉트(세션 만료)·id 누락이면 던진다. "첨부만 실패"로 안내하고
      // 「제출 완료」 창을 띄우면 만들어지지도 않은 건을 등록됐다고 알리게 된다.
      const result = await response.json().catch(() => null);
      const expenseId = resolveCreatedExpenseId(response, result);

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
      const warning = uploadFailureMessage(countUploadFailures(uploadResults), files.length, { required: true });
      if (warning) {
        toast.error(warning);
        // 상세 화면엔 첨부를 추가할 수단이 없다(보기·다운로드뿐). 수정 화면으로 보낸다
        // — SUBMITTED/APPROVED 입금요청은 수정 화면이 열린다(edit/page.tsx:117-121).
        setUploadIssue({ message: warning, detailHref: `/expenses/${expenseId}/edit` });
      }

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
      {/* Breadcrumb (desktop) */}
      <Breadcrumb items={[
        { label: "비용 관리", href: "/expenses" },
        { label: "새 비용", href: "/expenses/new" },
        { label: "입금요청 작성" },
      ]} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/expenses/new" className="flex items-center justify-center size-11 rounded-full glass-subtle text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">입금요청 작성</h1>
          <p className="text-footnote text-[var(--apple-secondary-label)] mt-0.5">
            입금요청서를 작성해주세요. 관리자 승인 후 처리됩니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit, onValidationError)} noValidate>
        {/* 기본 정보 */}
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

            {/* 카테고리 — 프리셋 + 내가 쓰던 것 + 직접 입력 */}
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <CategorySelectField
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  myCategories={myCategories}
                  suggestion={categorySuggestion}
                  error={errors.category?.message}
                />
              )}
            />

            {/* 호점 — 리테일 마트/약국일 때만. 다른 경우엔 의미 없는 칸이라 숨긴다. */}
            {askBranch && (
              <BranchSelectField value={branch} onChange={setBranch} />
            )}

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
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--apple-secondary-label)] pointer-events-none">원</span>
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
              {/* 입력 금액의 성격. 「VAT 포함」 체크박스가 켜면 10%를 더하는데
                  글자는 정반대로 읽혀 혼동을 샀다(제보 2026-09-02). */}
              <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
                <VatModeSelect
                  value={vatIncluded ? "EXCLUSIVE" : "INCLUSIVE"}
                  onChange={(m) => handleVatToggle(m === "EXCLUSIVE")}
                />
                <label className="flex items-center gap-2 cursor-pointer select-none pt-7">
                  <input
                    type="checkbox"
                    checked={freelancerDeduction}
                    onChange={(e) => handleFreelancerToggle(e.target.checked)}
                    className="size-5 rounded-md border-2 border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] accent-[var(--apple-blue)] cursor-pointer transition-colors"
                  />
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">프리랜서 원천징수 (-3.3%)</span>
                </label>
              </div>
              {supplyAmount > 0 && (() => {
                // 서버와 같은 순서로 계산한다(센트 → 배율 → 환산). 예전엔 화면만
                // '환산 → 배율'이라 USD 건에서 저장값과 몇 원 어긋났다.
                const bd = calcDepositBreakdownKRW(
                  supplyAmount,
                  currency,
                  vatIncluded,
                  freelancerDeduction,
                  exchangeRate?.rate ?? null,
                );
                // USD인데 환율을 못 받은 경우. 달러 숫자를 원화처럼 보여주면
                // ($100 → 100원) 금액을 잘못 입력한 줄 안다.
                if (!bd) {
                  return (
                    <div className="px-3 py-2 text-[13px] text-[var(--apple-secondary-label)] border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)] rounded-xl">
                      환율 정보를 불러오지 못해 원화 금액을 계산할 수 없습니다.
                    </div>
                  );
                }
                const baseKRW = bd.baseKRW;
                const vatAmount = bd.vatKRW;
                const withholdingAmount = bd.withholdingKRW;
                const finalAmount = bd.finalKRW;
                return (
                  <div className="px-3 py-2 text-[13px] text-[var(--apple-secondary-label)] space-y-0.5 border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)] rounded-xl">
                    <div className="flex justify-between">
                      <span>공급가액</span>
                      <span>{currency === "USD" ? `$${formatAmountUSD(supplyAmount)}` : `${formatAmount(baseKRW)}원`}</span>
                    </div>
                    {currency === "USD" && (
                      <div className="flex justify-between">
                        <span>원화 환산</span>
                        <span>{formatAmount(baseKRW)}원</span>
                      </div>
                    )}
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
                    <div className="flex justify-between font-medium text-[var(--apple-label)] pt-1 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)]">
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
              <label className="flex items-center gap-3 cursor-pointer select-none px-3 py-2.5 rounded-xl glass-subtle hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)] transition-colors">
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
                    <label className="flex items-center gap-3 cursor-pointer select-none px-3 py-2.5 rounded-xl glass-subtle hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)] transition-colors">
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
                                : "glass-subtle text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]"
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
                                : "glass-subtle text-[var(--apple-label)] hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]"
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
                          const bd = calcDepositBreakdownKRW(
                            supplyAmount,
                            currency,
                            vatIncluded,
                            freelancerDeduction,
                            exchangeRate?.rate ?? null,
                          );
                          if (!bd) {
                            return (
                              <div className="px-3 py-2 text-[13px] text-[var(--apple-secondary-label)] border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)] rounded-xl">
                                환율 정보를 불러오지 못해 원화 금액을 계산할 수 없습니다.
                              </div>
                            );
                          }
                          const totalBeforeWithholding = bd.totalBeforeWithholdingKRW;
                          const withholdingAmount = bd.withholdingKRW;
                          const prePaidAmount = Math.round(totalBeforeWithholding * watchedPrePaidPercentage / 100);
                          const postPaidAmount = totalBeforeWithholding - prePaidAmount - withholdingAmount;
                          return (
                            <div className="px-3 py-2 text-[13px] text-[var(--apple-secondary-label)] space-y-0.5 border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)] rounded-xl">
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
                              <div className="flex justify-between font-medium text-[var(--apple-label)] pt-1 border-t border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)]">
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
          <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-5">입금 정보</h2>

          <div className="space-y-5">
            {/* 최근 계좌 — 내가 보냈던 계좌(서버 기록). 고르면 계좌·카테고리·회사를 채운다. */}
            {myPayees.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3.5 text-[var(--apple-secondary-label)]" />
                  <span className="text-[13px] font-medium text-[var(--apple-secondary-label)]">최근 보낸 계좌</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {myPayees.map((p) => {
                    const active =
                      holderKey(typedHolder) === holderKey(p.accountHolder) &&
                      typedBank === p.bankName &&
                      accountKey(typedAccount) === accountKey(p.accountNumber);
                    return (
                      <button
                        key={`${holderKey(p.accountHolder)}|${p.bankName}|${accountKey(p.accountNumber)}`}
                        type="button"
                        aria-pressed={active}
                        onClick={() => applyPayee(p)}
                        className={cn(
                          "flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors",
                          active
                            ? "bg-[rgba(0,122,255,0.10)] ring-1 ring-[var(--apple-blue)]"
                            : "glass-input hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]"
                        )}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 text-[13px] font-medium text-[var(--apple-blue)]">{p.bankName}</span>
                          <span className="truncate text-[13px] text-[var(--apple-label)]">{p.accountHolder}</span>
                          <span className="truncate text-[13px] text-[var(--apple-secondary-label)]">{p.accountNumber}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="hidden max-w-[120px] truncate text-[11px] text-[var(--apple-secondary-label)] sm:inline">
                            {getCategoryLabel(p.category)}
                          </span>
                          <span className="text-[12px] font-medium text-[var(--apple-blue)]">
                            {active ? "선택됨" : "불러오기"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
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
                        "flex h-10 w-full items-center justify-between rounded-xl border border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)] px-3 text-sm transition-colors hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]",
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
              {holderMatch && !holderMatchApplied && (
                <button
                  type="button"
                  onClick={() => applyPayee(holderMatch)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left glass-input sm:min-h-9"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--apple-secondary-label)]">
                    지난번 계좌{" "}
                    <span className="font-medium text-[var(--apple-label)]">
                      {holderMatch.bankName} {holderMatch.accountNumber}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold text-[var(--apple-blue)]">불러오기</span>
                </button>
              )}
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

        {/* 사입 — 약국 납품이면 체크. 세금계산서 발행 관리로 이어진다. */}
        <div className="glass p-6 mt-4">
          <PurchaseFields value={purchase} onChange={setPurchase} />
        </div>

        {/* 파일 첨부 (필수) */}
        <div className="glass p-6 mt-4">
          <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-1">
            파일 첨부 <span className="text-[var(--apple-red)]">*</span>
          </h2>
          <p className="text-footnote text-[var(--apple-secondary-label)] mb-4">
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
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link href="/expenses" className="w-full sm:w-auto">
            <Button type="button" variant="outline" className="w-full rounded-full h-11 glass border-[var(--apple-separator)]">
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
        description="입금요청이 정상적으로 제출되었습니다. 관리자 승인을 기다려주세요."
        warning={uploadIssue?.message}
        detailHref={uploadIssue?.detailHref}
      />
    </div>
  );
}
