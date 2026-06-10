"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Loader2, Search, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { FileUpload } from "@/components/forms/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatAmount,
  type FileWithPreview,
} from "@/lib/validations/expense-form";
import { formatExpenseAmount, getCategoryLabel } from "@/lib/utils/expense-utils";
import { cn } from "@/lib/utils";

const SubmitSuccessDialog = dynamic(
  () => import("@/components/forms/submit-success-dialog").then((m) => m.SubmitSuccessDialog),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OriginalExpense {
  id: string;
  type: string;
  title: string;
  amount: number;
  currency: string;
  amountOriginal: number | null;
  category: string;
  transactionDate: string;
  merchantName?: string | null;
  /** 이 원거래에 이미 연결된 반품들 */
  refunds?: { amount: number; amountOriginal: number | null }[];
}

interface SearchResult {
  id: string;
  type: string;
  title: string;
  amount: number;
  currency: string;
  amountOriginal: number | null;
  category: string;
  transactionDate: string;
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RefundForm() {
  const searchParams = useSearchParams();
  const originalIdParam = searchParams.get("originalId");

  const [original, setOriginal] = useState<OriginalExpense | null>(null);
  const [loadingOriginal, setLoadingOriginal] = useState(!!originalIdParam);

  // ── 원거래 검색 (originalId 없이 진입한 경우) ──
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 폼 상태 ──
  const [amountInput, setAmountInput] = useState("");
  const [transactionDate, setTransactionDate] = useState(formatDateISO(new Date()));
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const isUSD = original?.currency === "USD";

  // 환불 가능 잔액 (원거래 통화 기준: USD는 센트, KRW는 원)
  const refundedSoFar = (original?.refunds ?? []).reduce(
    (acc, r) => acc + (isUSD ? (r.amountOriginal ?? 0) : r.amount),
    0,
  );
  const originalTotal = original
    ? isUSD
      ? (original.amountOriginal ?? 0)
      : original.amount
    : 0;
  const remaining = originalTotal - refundedSoFar;

  // ── 원거래 로드 (상세 페이지에서 진입) ──
  const loadOriginal = useCallback(async (id: string) => {
    setLoadingOriginal(true);
    try {
      const res = await fetch(`/api/expenses/${id}`);
      if (!res.ok) throw new Error("원거래를 불러오지 못했습니다.");
      const json = await res.json();
      const e = json.data;
      if (e.type === "REFUND") throw new Error("반품 건은 원거래로 선택할 수 없습니다.");
      if (e.status !== "APPROVED") throw new Error("승인된 비용만 반품할 수 있습니다.");
      setOriginal({
        id: e.id,
        type: e.type,
        title: e.title,
        amount: e.amount,
        currency: e.currency ?? "KRW",
        amountOriginal: e.amountOriginal ?? null,
        category: e.category,
        transactionDate: e.transactionDate,
        merchantName: e.merchantName ?? null,
        refunds: e.refunds ?? [],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "원거래를 불러오지 못했습니다.");
      setOriginal(null);
    } finally {
      setLoadingOriginal(false);
    }
  }, []);

  useEffect(() => {
    if (originalIdParam) loadOriginal(originalIdParam);
  }, [originalIdParam, loadOriginal]);

  // 원거래가 정해지면 환불 금액 기본값 = 잔액 전액
  useEffect(() => {
    if (!original) return;
    const rem =
      (original.currency === "USD" ? (original.amountOriginal ?? 0) : original.amount) -
      (original.refunds ?? []).reduce(
        (acc, r) =>
          acc + (original.currency === "USD" ? (r.amountOriginal ?? 0) : r.amount),
        0,
      );
    setAmountInput(
      original.currency === "USD" ? (rem / 100).toFixed(2) : String(rem),
    );
  }, [original]);

  // ── 원거래 검색 (디바운스) ──
  const handleSearchChange = useCallback((value: string) => {
    setSearchTerm(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({
          status: "APPROVED",
          limit: "10",
          ownOnly: "false", // 관리자는 전체, MEMBER는 서버에서 본인 것만 반환
        });
        if (value) params.set("search", value);
        const res = await fetch(`/api/expenses?${params.toString()}`);
        if (!res.ok) throw new Error();
        const json = await res.json();
        const items = (json.data ?? []) as (SearchResult & { type: string })[];
        setSearchResults(items.filter((e) => e.type !== "REFUND"));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  // 첫 진입 시(검색어 없이) 최근 승인 건 미리 로드
  useEffect(() => {
    if (!originalIdParam) handleSearchChange("");
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [originalIdParam, handleSearchChange]);

  // ── 제출 ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!original) {
      toast.error("원거래를 선택해주세요.");
      return;
    }

    // 입력 금액 → 원거래 통화 단위 (USD: 센트, KRW: 원)
    const parsed = isUSD
      ? Math.round(parseFloat(amountInput || "0") * 100)
      : parseInt(amountInput.replace(/[^0-9]/g, "") || "0", 10);

    if (!parsed || parsed <= 0) {
      toast.error("환불 금액을 입력해주세요.");
      return;
    }
    if (parsed > remaining) {
      toast.error(
        `환불 금액이 잔액을 초과합니다. (잔액: ${
          isUSD ? `$${(remaining / 100).toFixed(2)}` : `${formatAmount(remaining)}원`
        })`,
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "REFUND",
          originalExpenseId: original.id,
          amount: parsed,
          transactionDate,
          description: description || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message || "반품 등록에 실패했습니다.");
      }

      // 첨부 업로드 (선택) — 일부 실패해도 등록 자체는 성공 처리
      if (files.length > 0) {
        const result = await response.json().catch(() => null);
        const expenseId = result?.data?.id;
        if (expenseId) {
          const uploadResults = await Promise.allSettled(
            files.map((fileItem) => {
              const formData = new FormData();
              formData.append("file", fileItem.file);
              formData.append("expenseId", expenseId);
              formData.append("documentType", "RECEIPT");
              return fetch("/api/attachments/upload", { method: "POST", body: formData }).then(
                (res) => {
                  if (!res.ok) throw new Error(fileItem.file.name);
                  return res;
                },
              );
            }),
          );
          const failed = uploadResults.filter((r) => r.status === "rejected");
          if (failed.length > 0) {
            toast.error(
              `${files.length}개 파일 중 ${failed.length}개 업로드 실패. 비용 상세에서 다시 첨부해주세요.`,
            );
          }
        }
      }

      setShowSuccess(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "반품 등록에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Breadcrumb
        items={[
          { label: "비용 관리", href: "/expenses" },
          { label: "새 비용", href: "/expenses/new" },
          { label: "반품/환불 등록" },
        ]}
      />

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/expenses/new"
          className="flex items-center justify-center size-11 rounded-full glass-subtle text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] transition-colors"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">반품/환불 등록</h1>
          <p className="text-footnote text-[var(--apple-secondary-label)] mt-0.5">
            반품된 금액은 비용 합계에서 차감됩니다. 등록 즉시 반영됩니다.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-5">
          {/* ── 1. 원거래 선택 ── */}
          <div className="glass p-6">
            <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-4">
              원거래 <span className="text-[var(--apple-red)]">*</span>
            </h2>

            {loadingOriginal ? (
              <div className="flex items-center gap-2 text-sm text-[var(--apple-secondary-label)] py-4">
                <Loader2 className="size-4 animate-spin" /> 원거래 불러오는 중...
              </div>
            ) : original ? (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3 px-3.5 py-3 rounded-xl bg-[rgba(0,0,0,0.04)] dark:bg-[rgba(255,255,255,0.06)]">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--apple-label)] truncate">
                      {original.title}
                    </p>
                    <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5">
                      {original.transactionDate.replaceAll("-", ".")} ·{" "}
                      {getCategoryLabel(original.category)}
                      {original.merchantName ? ` · ${original.merchantName}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums text-[var(--apple-label)]">
                      {formatExpenseAmount(original.amount, original.currency, original.amountOriginal)}
                    </p>
                    <p className="text-[12px] text-[var(--apple-secondary-label)] mt-0.5 tabular-nums">
                      환불 가능:{" "}
                      {isUSD
                        ? `$${(remaining / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                        : `${formatAmount(remaining)}원`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOriginal(null);
                    setAmountInput("");
                    handleSearchChange("");
                  }}
                  className="text-[13px] text-[var(--apple-blue)] hover:underline"
                >
                  다른 비용 선택
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--apple-secondary-label)]" />
                  <Input
                    placeholder="제목, 가맹점 등으로 원거래 검색..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9"
                    aria-label="원거래 검색"
                  />
                </div>
                {searching ? (
                  <div className="flex items-center gap-2 text-[13px] text-[var(--apple-secondary-label)] py-2">
                    <Loader2 className="size-3.5 animate-spin" /> 검색 중...
                  </div>
                ) : searchResults.length === 0 ? (
                  <p className="text-[13px] text-[var(--apple-secondary-label)] py-2">
                    반품할 수 있는 승인된 비용이 없습니다.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                    {searchResults.map((e) => (
                      <li key={e.id}>
                        <button
                          type="button"
                          onClick={() => loadOriginal(e.id)}
                          className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-[rgba(0,0,0,0.06)] dark:border-[rgba(255,255,255,0.08)] hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)] transition-colors text-left apple-press"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm text-[var(--apple-label)] truncate">
                              {e.title}
                            </span>
                            <span className="block text-[12px] text-[var(--apple-secondary-label)] mt-0.5">
                              {e.transactionDate.replaceAll("-", ".")} ·{" "}
                              {getCategoryLabel(e.category)}
                            </span>
                          </span>
                          <span className="text-sm font-medium tabular-nums text-[var(--apple-label)] shrink-0">
                            {formatExpenseAmount(e.amount, e.currency, e.amountOriginal)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* ── 2. 환불 정보 ── */}
          <div className={cn("glass p-6 space-y-5", !original && "opacity-50 pointer-events-none")}>
            <h2 className="text-subheadline font-semibold text-[var(--apple-label)]">환불 정보</h2>

            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">
                환불 금액{isUSD ? " (USD)" : " (원)"}{" "}
                <span className="text-[var(--apple-red)]">*</span>
              </Label>
              <Input
                id="refund-amount"
                inputMode="decimal"
                placeholder={isUSD ? "0.00" : "0"}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
              {original && (
                <p className="text-xs text-[var(--apple-secondary-label)]">
                  부분 환불 가능 · 잔액{" "}
                  {isUSD
                    ? `$${(remaining / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                    : `${formatAmount(remaining)}원`}{" "}
                  이내
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="refund-date">
                반품일 <span className="text-[var(--apple-red)]">*</span>
              </Label>
              <Input
                id="refund-date"
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="refund-reason">사유</Label>
              <Textarea
                id="refund-reason"
                placeholder="예: 단순 변심 반품, 불량으로 환불, 행사 취소로 회수 등"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label>증빙 첨부 (선택)</Label>
              <FileUpload files={files} onFilesChange={setFiles} />
            </div>
          </div>

          {/* ── 제출 ── */}
          <button
            type="submit"
            disabled={isSubmitting || !original}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-[var(--apple-blue)] text-white text-[15px] font-semibold rounded-full hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] transition-colors disabled:opacity-50 apple-press"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 등록 중...
              </>
            ) : (
              <>
                <Undo2 className="size-4" /> 반품 등록
              </>
            )}
          </button>
        </div>
      </form>

      <SubmitSuccessDialog
        open={showSuccess}
        newSubmitPath="/expenses/new"
        title="등록 완료"
        description="반품/환불이 등록되었습니다. 비용 합계에서 차감됩니다."
      />
    </div>
  );
}
