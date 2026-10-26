"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  PurchaseFields,
  emptyPurchaseFields,
  toPurchasePayload,
  type PurchaseFieldValues,
} from "@/components/forms/purchase-fields";
import { VatModeSelect } from "@/components/forms/vat-mode-select";
import { BranchSelectField, shouldAskBranch } from "@/components/forms/branch-select-field";
import { CategorySelectField } from "@/components/forms/category-select-field";
import type { MerchantSuggestion } from "@/services/autofill.service";
import { merchantKey } from "@/lib/utils/autofill";
import { CompanySelector } from "@/components/forms/company-selector";
import { FileUpload } from "@/components/forms/file-upload";
import { OcrNotice, OcrSuggestion } from "@/components/forms/ocr-suggestion";
import type { OcrFields, OcrResult } from "@/lib/ocr/types";
import { cardAmountMismatch, suggestAmountKRW, type AmountSuggestion } from "@/lib/ocr/suggest";
import dynamic from "next/dynamic";
const SubmitSuccessDialog = dynamic(() => import("@/components/forms/submit-success-dialog").then(m => m.SubmitSuccessDialog), { ssr: false });
import {
  corporateCardFormSchema,
  type CorporateCardFormData,
  type FileWithPreview,
  formatAmount,
  formatAmountUSD,
  parseAmountUSD,
  dollarsToCents,
  formatDateISO,
} from "@/lib/validations/expense-form";
import { countUploadFailures, uploadFailureMessage } from "@/lib/utils/upload-results";
import { resolveCreatedExpenseId } from "@/lib/utils/submit-result";
import { cn } from "@/lib/utils";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useFormBusy } from "@/hooks/use-form-busy";
import { usePendingCardSummary } from "@/hooks/use-pending-card-summary";
import { pendingCardBatchHref, pendingCardLabel } from "@/lib/card-batch/pending-summary";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { CardPlanSuggestions, PlanLinkedChip, usePreselectedPlan, type PlanPick, useCardSuggestions } from "@/components/forms/plan-pick";
import { planLinkFailed, shouldFillCompany } from "@/lib/plans/pick-ui";

interface CorporateCardFormProps {
  planId?: string;
  initialCompanies?: { id: string; name: string; slug: string; currency: string }[];
  /** 본인이 예전에 직접 입력한 카테고리 (최근순). 매번 다시 타이핑하지 않게 버튼으로 띄운다. */
  myCategories?: string[];
  /** 내가 예전에 쓴 가맹점 → 그때 카테고리 (키: merchantKey). 같은 가맹점이면 추천한다. */
  myMerchantCategories?: Record<string, MerchantSuggestion>;
  prefillData?: {
    amount: number;
    merchantName: string | null;
    transactionDate: string;
    gowidTxId: string;
    companyId: string | null;
  };
}

export default function CorporateCardForm({ initialCompanies, prefillData, myCategories = [], myMerchantCategories = {}, planId }: CorporateCardFormProps) {
  const pendingSummary = usePendingCardSummary(!prefillData);
  const pendingLabel = pendingCardLabel(pendingSummary?.count);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadBusy, setIsUploadBusy] = useState(false); // 사진 줄이는 중엔 제출 잠금
  const [showSuccess, setShowSuccess] = useState(false);
  // 비용은 만들어졌는데 첨부 업로드가 실패한 경우 — 성공 창에서 상세로 안내한다.
  const [uploadIssue, setUploadIssue] = useState<{ message: string; detailHref: string | null } | null>(null);
  const [amountDisplay, setAmountDisplay] = useState("");
  // 금액은 RHF register가 아니라 setValue(shouldDirty 없음)로 쓰므로 isDirty가 안 켜진다.
  // 금액만 입력한 폼도 "작성 중"으로 보려면 따로 표시해야 한다. (GoWid 프리필은
  // URL 파라미터로 서버에서 다시 채워지므로 사용자가 직접 친 경우만 센다.)
  const [amountTouched, setAmountTouched] = useState(false);
  const [showCustomMerchant, setShowCustomMerchant] = useState(false);

  // Company selection
  const [companyId, setCompanyId] = useState("");
  // 비용계획 연결(GoWid 결제일 때만 후보를 묻는다). 한 건만, 다시 누르면 해제.
  const [selectedPick, setSelectedPick] = useState<PlanPick | null>(null);
  const companyTouchedRef = useRef(false);
  const planCompanyRef = useRef<string | null>(null);
  const preselect = usePreselectedPlan(planId, {
    onLoaded: (pick) => {
      setSelectedPick(pick);
      planCompanyRef.current = pick.companyId;
      if (shouldFillCompany({
        touched: companyTouchedRef.current,
        planCompanyId: pick.companyId,
        currentCompanyId: companyId,
        availableCompanyIds: initialCompanies?.map((c) => c.id) ?? [],
      })) setCompanyId(pick.companyId);
    },
    onMissing: () => toast.error("연결하려던 계획을 불러오지 못했습니다."),
  });
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [currency, setCurrency] = useState("KRW");
  const planSuggestions = useCardSuggestions({
    companyId: prefillData ? (prefillData.companyId ?? (companyId || null)) : null,
    amount: prefillData?.amount,
    date: prefillData?.transactionDate,
    merchant: prefillData?.merchantName,
  });

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
          // GoWid prefill wins over user-profile fallback. The card itself
          // belongs to a specific company, so submitting under the user's
          // default company would file the expense to the wrong entity for
          // multi-company users.
          if (!prefillData?.companyId && !companyTouchedRef.current && !planCompanyRef.current) {
            setCompanyId(cid);
          }
        }
      })
      .catch(() => {});
    if (prefillData?.companyId && !companyTouchedRef.current && !planCompanyRef.current) {
      setCompanyId(prefillData.companyId);
    }
  }, [prefillData?.companyId]);

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
  const [purchase, setPurchase] = useState<PurchaseFieldValues>(emptyPurchaseFields);
  const [branch, setBranch] = useState<string | null>(null);

  const [supplyAmount, setSupplyAmount] = useState(0);
  // 영수증 사진(OCR)에서 읽은 제안 — 첨부를 지우면 같이 사라진다
  const [ocrResults, setOcrResults] = useState<Array<{ fileId: string; fields: OcrFields }>>([]);

  // Optional receipt attachments
  const [files, setFiles] = useState<FileWithPreview[]>([]);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
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

  // 호점은 **리테일의 마트/약국**일 때만 묻는다. 회사 slug는 서버가 내려준
  // 목록에서 찾는다(선택값은 id뿐이라 slug를 따로 들고 있지 않다).
  const selectedCompanySlug =
    initialCompanies?.find((c) => c.id === companyId)?.slug ?? null;
  const askBranch = shouldAskBranch(selectedCompanySlug, watch("category"));

  // 같은 가맹점에서 예전에 쓴 적이 있으면 그때 카테고리를 추천한다.
  // 고위드 알림으로 들어온 경우 가맹점이 이미 채워져 있어서 바로 뜬다.
  const mKey = merchantKey(watch("merchantName"));
  // Object.hasOwn — 가맹점명이 "constructor" 같은 글자면 객체 기본 속성이 걸린다.
  const merchantHit = mKey && Object.hasOwn(myMerchantCategories, mKey)
    ? myMerchantCategories[mKey]
    : undefined;
  const categorySuggestion = merchantHit
    ? { category: merchantHit.category, from: merchantHit.merchantName }
    : null;

  // Warn on unsaved changes (browser close / refresh)
  useUnsavedChanges(isDirty || files.length > 0);
  // 작성·제출 중엔 새 배포의 강제 새로고침을 미룬다 (sw-update-prompt)
  useFormBusy("corporate-card", isDirty || files.length > 0 || amountTouched || isSubmitting || isUploadBusy);

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

  // 계획과 법카 건의 회사가 다르면 서버가 연결을 못 한다 — 알리고 보내지 않는다.
  const planCompanyMismatch = !!selectedPick && !!companyId && selectedPick.companyId !== companyId;
  const activePlanId = selectedPick && !planCompanyMismatch ? selectedPick.id : null;

  // Handle company change — only update companyId (currency is independent)
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

  const handleDocumentRead = useCallback((fileId: string, result: OcrResult) => {
    setOcrResults((prev) => [...prev.filter((r) => r.fileId !== fileId), { fileId, fields: result.fields }]);
  }, []);

  // 금액 「적용」: 직접 입력과 같은 경로. 영수증 합계는 부가세 포함이라 보통 「부가세 포함」으로 맞춘다.
  const applyOcrAmount = useCallback(
    (s: AmountSuggestion) => {
      if (currency !== "KRW") return;
      setVatIncluded(s.vatExclusive);
      setAmountTouched(true);
      setSupplyAmount(s.base);
      setAmountDisplay(formatAmount(s.base));
      setValue("amount", calcFinalAmount(s.base, s.vatExclusive, freelancerDeduction), { shouldValidate: true });
      toast.success("사진에서 읽은 금액을 넣었습니다. 맞는지 확인해주세요.");
      document.getElementById("amount")?.focus();
    },
    [currency, freelancerDeduction, calcFinalAmount, setValue]
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
          ...(activePlanId ? { planId: activePlanId } : {}),
          hasFreelancerWithholding: freelancerDeduction,
          ...toPurchasePayload(purchase),
          branch: askBranch ? branch : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error?.message || "비용 제출에 실패했습니다."
        );
      }

      // 리다이렉트(세션 만료)·id 누락이면 던진다. 첨부가 없어도 확인한다 —
      // 비용이 안 만들어졌는데 「제출 완료」를 띄우면 안 된다.
      const result = await response.json().catch(() => null);
      const expenseId = resolveCreatedExpenseId(response, result);
      if (planLinkFailed(result)) {
        toast.error("법카 사용 내역은 올라갔지만 비용계획 연결은 실패했습니다. 계획 화면에서 연결해주세요.");
      }

      // Upload optional attachments (receipts). 법카사용은 첨부 선택사항이라
      // 업로드가 일부 실패해도 제출 자체는 성공으로 처리 — 수정 화면에서 재첨부 가능.
      if (files.length > 0) {
        const uploadResults = await Promise.allSettled(
          files.map((fileItem) => {
            const formData = new FormData();
            formData.append("file", fileItem.file);
            formData.append("expenseId", expenseId);
            formData.append("documentType", "RECEIPT");
            return fetch("/api/attachments/upload", { method: "POST", body: formData })
              .then((res) => { if (!res.ok) throw new Error(fileItem.file.name); return res; });
          })
        );
        const warning = uploadFailureMessage(countUploadFailures(uploadResults), files.length);
        if (warning) {
          toast.error(warning);
          // 상세 화면엔 첨부 추가 수단이 없다. 수정 화면으로 보낸다
          // — SUBMITTED/APPROVED 법카는 수정 화면이 열린다(edit/page.tsx:106-110).
          setUploadIssue({ message: warning, detailHref: `/expenses/${expenseId}/edit` });
        }
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


  // 고위드 결제에서 넘어온 건은 결제 금액이 기준 — 영수증이 다르면 알려만 주고 바꾸지 않는다.
  // 그 밖에는 가맹점·금액을 「적용」으로 제안한다. 이미 같은 값이면 숨긴다.
  // 지금 붙어 있는 첨부 순서대로, 값이 나온 첫 번째 결과를 쓴다 (지운 첨부의 결과는 쓰지 않는다)
  const ocrAttached = files
    .map((f) => ocrResults.find((r) => r.fileId === f.id)?.fields)
    .filter((x): x is OcrFields => !!x);
  const ocrMismatch = prefillData
    ? ocrAttached.map((x) => cardAmountMismatch(x, prefillData.amount)).find((x) => x !== null) ?? null
    : null;
  const ocrAmountSug = prefillData
    ? null
    : ocrAttached.map(suggestAmountKRW).find((x): x is AmountSuggestion => !!x) ?? null;
  const typedMerchant = watch("merchantName");
  const ocrMerchantName = ocrAttached.find((x) => x.merchantName?.trim())?.merchantName ?? null;
  const ocrMerchant =
    ocrMerchantName && !prefillData?.merchantName && merchantKey(typedMerchant) !== merchantKey(ocrMerchantName)
      ? ocrMerchantName
      : null;
  const ocrAmountNode =
    ocrMismatch !== null && prefillData ? (
      <OcrNotice tone="warn">
        영수증 금액 {formatAmount(ocrMismatch)}원이 카드 결제 금액 {formatAmount(prefillData.amount)}원과 다릅니다. 결제 금액으로 제출됩니다.
      </OcrNotice>
    ) : ocrAmountSug && !(supplyAmount === ocrAmountSug.base && vatIncluded === ocrAmountSug.vatExclusive) ? (
      currency === "KRW" ? (
        <OcrSuggestion
          label="사진에서 읽은 금액"
          value={`${formatAmount(ocrAmountSug.total)}원`}
          onApply={() => applyOcrAmount(ocrAmountSug)}
        />
      ) : (
        <OcrNotice>사진에서 읽은 금액 {formatAmount(ocrAmountSug.total)}원 — 원화(₩)로 바꾸면 적용할 수 있습니다.</OcrNotice>
      )
    ) : null;
  const ocrMerchantNode = ocrMerchant ? (
    <OcrSuggestion
      label="사진에서 읽은 가맹점"
      value={ocrMerchant}
      onApply={() => {
        setValue("merchantName", ocrMerchant, { shouldValidate: true, shouldDirty: true });
        setShowCustomMerchant(true);
        toast.success("사진에서 읽은 가맹점을 넣었습니다.");
      }}
    />
  ) : null;

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

      {!prefillData && (
        <Link
          href={pendingLabel ? pendingCardBatchHref(pendingSummary?.oldestDate) : "/expenses/new/card-batch"}
          className="flex items-center gap-1 min-h-11 text-[13px] font-medium text-[var(--apple-blue)]"
        >
          {pendingLabel ? `${pendingLabel} — 한 번에 올리기` : "결제가 여러 건이면 한 번에 올리기"}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}

      {prefillData && (
        <div className="p-3 rounded-xl bg-[rgba(0,122,255,0.08)] border border-[rgba(0,122,255,0.15)]">
          <p className="text-[13px] text-[var(--apple-blue)]">
            고위드에서 가져온 거래 정보가 자동 입력되었습니다.
            제목과 카테고리를 선택한 뒤 제출해주세요.
          </p>
        </div>
      )}

      {selectedPick ? (
        <PlanLinkedChip
          title={selectedPick.title}
          onCancel={() => setSelectedPick(null)}
          warning={planCompanyMismatch ? "계획의 회사와 달라 연결되지 않습니다. 회사를 맞추거나 연결을 해제해주세요." : null}
        />
      ) : prefillData && preselect !== "pending" ? (
        <CardPlanSuggestions
          suggestions={planSuggestions}
          selectedId={null}
          onToggle={setSelectedPick}
        />
      ) : null}

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
              {ocrMerchantNode}
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
              {ocrAmountNode}

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
                  ) : (
                    <p className="text-[var(--apple-red)]">환율 정보를 불러올 수 없습니다. 잠시 후 다시 시도해주세요.</p>
                  )}
                </div>
              )}

              {/* 입력 금액의 성격 + 프리랜서 원천징수
                  「VAT 포함」 체크박스는 켜면 10%를 더하는데 글자는 정반대로
                  읽혀서 혼동을 샀다(제보 2026-09-02). 두 선택지로 바꿨다. */}
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
                    className="size-4 rounded border-[rgba(0,0,0,0.15)] dark:border-[rgba(255,255,255,0.2)] text-[var(--apple-blue)] focus:ring-[var(--apple-blue)] cursor-pointer"
                  />
                  <span className="text-[13px] text-[var(--apple-secondary-label)]">
                    프리랜서 원천징수 (-3.3%)
                  </span>
                </label>
              </div>

              {/* 금액 내역 */}
              {supplyAmount > 0 && (
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

        {/* 사입 — 약국 납품이면 체크. 세금계산서 발행 관리로 이어진다. */}
        <div className="glass p-6 mt-4">
          <PurchaseFields value={purchase} onChange={setPurchase} />
        </div>

        {/* 파일 첨부 (선택) */}
        <div className="glass p-6 mt-4">
          <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-1">
            영수증 첨부
          </h2>
          <p className="text-footnote text-[var(--apple-secondary-label)] mb-4">
            영수증 사진이나 PDF를 첨부할 수 있습니다 (선택사항).
          </p>
          <FileUpload
            files={files}
            onFilesChange={setFiles}
            onBusyChange={setIsUploadBusy}
            onDocumentRead={handleDocumentRead}
          />
          {(ocrMerchantNode || ocrAmountNode) && (
            <div className="mt-3 space-y-1.5">
              {ocrMerchantNode}
              {ocrAmountNode}
            </div>
          )}
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
            disabled={isSubmitting || isUploadBusy}
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
        warning={uploadIssue?.message}
        detailHref={uploadIssue?.detailHref}
      />
    </div>
  );
}
