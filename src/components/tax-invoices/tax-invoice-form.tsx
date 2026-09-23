"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Building2, FileSpreadsheet, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VatModeSelect } from "@/components/forms/vat-mode-select";
import { breakdownFor, type VatMode } from "@/lib/utils/vat";
import {
  CHARGE_TYPE_LABEL,
  TAX_INVOICE_ISSUERS,
  formatBizNo,
  isValidBizNoChecksum,
  issueDeadline,
  bizNoDigits,
  type ChargeType,
  type IssuerCode,
} from "@/lib/tax-invoice";
import type { BuyerSuggestion, ErpSalesDoc } from "@/services/tax-invoice.service";
import { taxFetch, todayKST, won } from "./api";
import type { TaxInvoiceFormInitial } from "./initial";

// ---------------------------------------------------------------------------
// 세금계산서 발행 요청 폼 (새 요청 · 수정 공용).
//
// 홀세일(HOW)이면 SIMS 전표를 골라 거래처·품목·금액을 한 번에 채운다. 금액은 전표의 공급가액·부가세를
// **그대로** 쓴다 — 총액에서 다시 나누면 원 단위 반올림이 전표와 어긋날 수 있다. 손으로 금액을 고치면
// 그때부터는 입력 금액 + 부가세 포함/별도로 계산한다(사입 계산서와 같은 규칙, lib/utils/vat.ts).
// ---------------------------------------------------------------------------

const fieldClass = "h-11 rounded-xl";

export function TaxInvoiceForm({
  initial,
  canUseErp,
}: {
  initial: TaxInvoiceFormInitial;
  /** SIMS 전표 불러오기(관리자만 — ERP 도 홀세일 매출은 master 에게만 보인다). */
  canUseErp: boolean;
}) {
  const router = useRouter();
  const editing = Boolean(initial.id);

  const [issuerCode, setIssuerCode] = useState<IssuerCode>(initial.issuerCode);
  const [buyerName, setBuyerName] = useState(initial.buyerName);
  const [buyerBizNo, setBuyerBizNo] = useState(formatBizNo(initial.buyerBizNo));
  const [buyerCeo, setBuyerCeo] = useState(initial.buyerCeo);
  const [buyerEmail, setBuyerEmail] = useState(initial.buyerEmail);
  const [buyerAddress, setBuyerAddress] = useState(initial.buyerAddress);
  const [items, setItems] = useState(initial.items);
  const [supplyDate, setSupplyDate] = useState(initial.supplyDate);
  const [chargeType, setChargeType] = useState<ChargeType>(initial.chargeType);
  const [memo, setMemo] = useState(initial.memo);
  const [erpRef, setErpRef] = useState<{ date: string; doc: string } | null>(
    initial.erpSalesDate && initial.erpDocumentNo ? { date: initial.erpSalesDate, doc: initial.erpDocumentNo } : null,
  );

  // 금액: exact(전표·저장값) 가 있으면 그것, 손으로 고치면 입력 + 부가세 모드.
  const initialExact =
    initial.supplyAmount != null && initial.vatAmount != null
      ? { supply: initial.supplyAmount, vat: initial.vatAmount }
      : null;
  const [exact, setExact] = useState(initialExact);
  const [amountText, setAmountText] = useState(
    initialExact ? (initialExact.supply + initialExact.vat).toLocaleString("ko-KR") : "",
  );
  const [vatMode, setVatMode] = useState<VatMode>("INCLUSIVE");
  const amount = Number(amountText.replace(/\D/g, "")) || 0;
  const breakdown = useMemo(
    () => (exact ? { supply: exact.supply, vat: exact.vat, total: exact.supply + exact.vat } : breakdownFor(amount, vatMode)),
    [exact, amount, vatMode],
  );

  const [saving, setSaving] = useState(false);
  const lock = useRef(false);

  const bizDigits = bizNoDigits(buyerBizNo);
  const bizWarning =
    bizDigits.length === 10 && !isValidBizNoChecksum(bizDigits)
      ? "검증번호가 맞지 않습니다. 번호를 다시 확인해주세요(틀린 번호로 발행되면 수정세금계산서를 다시 끊어야 합니다)."
      : null;

  const applyDoc = useCallback((doc: ErpSalesDoc) => {
    setBuyerName(doc.payeeName);
    setItems(doc.items);
    setSupplyDate(doc.salesDate);
    setExact({ supply: doc.supplyAmount, vat: doc.vatAmount });
    setAmountText(doc.total.toLocaleString("ko-KR"));
    setErpRef({ date: doc.salesDate, doc: doc.documentNo });
    toast.success(`${doc.salesDate.slice(5).replace("-", "/")} 전표 ${doc.documentNo}번을 불러왔습니다. 사업자번호를 채워주세요.`);
  }, []);

  const applyBuyer = useCallback((b: BuyerSuggestion) => {
    setBuyerName(b.name);
    setBuyerBizNo(formatBizNo(b.bizNo));
    if (b.ceo) setBuyerCeo(b.ceo);
    if (b.email) setBuyerEmail(b.email);
    if (b.address) setBuyerAddress(b.address);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (lock.current) return;
    if (!buyerName.trim()) return toast.error("거래처 상호를 입력해주세요.");
    if (bizDigits.length !== 10) return toast.error("사업자등록번호 10자리를 입력해주세요.");
    if (!items.trim()) return toast.error("품목을 입력해주세요.");
    if (breakdown.supply <= 0) return toast.error("금액을 입력해주세요.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(supplyDate)) return toast.error("작성일자를 선택해주세요.");

    const body = {
      issuerCode,
      buyerName: buyerName.trim(),
      buyerBizNo: bizDigits,
      buyerCeo: buyerCeo.trim() || null,
      buyerEmail: buyerEmail.trim() || null,
      buyerAddress: buyerAddress.trim() || null,
      items: items.trim(),
      supplyAmount: breakdown.supply,
      vatAmount: breakdown.vat,
      supplyDate,
      chargeType,
      memo: memo.trim() || null,
      erpSalesDate: erpRef?.date ?? null,
      erpDocumentNo: erpRef?.doc ?? null,
    };

    lock.current = true;
    setSaving(true);
    const res = editing
      ? await taxFetch<{ id: string }>(`/api/tax-invoices/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : await taxFetch<{ id: string }>("/api/tax-invoices", { method: "POST", body: JSON.stringify(body) });
    setSaving(false);
    lock.current = false;
    if (!res.ok) return toast.error(res.message);
    toast.success(editing ? "요청을 수정했습니다." : "발행 요청을 보냈습니다. 관리자에게 알림이 갑니다.");
    router.push(`/tax-invoices?focus=${res.data.id}`);
    router.refresh();
  }, [
    buyerName, bizDigits, items, breakdown, supplyDate, issuerCode, buyerCeo, buyerEmail, buyerAddress,
    chargeType, memo, erpRef, editing, initial.id, router,
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-3 animate-fade-up">
        <Link
          href="/tax-invoices"
          aria-label="세금계산서 요청 목록으로"
          className="flex size-11 items-center justify-center rounded-full glass-subtle text-[var(--apple-secondary-label)] transition-colors hover:text-[var(--apple-label)]"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">{editing ? "발행 요청 수정" : "세금계산서 발행 요청"}</h1>
          <p className="mt-0.5 text-footnote text-[var(--apple-secondary-label)]">
            약국·의원 등에 판 건의 매출 세금계산서를 관리자에게 요청합니다.
          </p>
        </div>
      </div>

      {/* 발행 법인 */}
      <section className="glass p-5 sm:p-6 space-y-3">
        <h2 className="text-subheadline font-semibold text-[var(--apple-label)]">발행 법인</h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="발행 법인">
          {TAX_INVOICE_ISSUERS.map((i) => (
            <button
              key={i.code}
              type="button"
              role="radio"
              aria-checked={issuerCode === i.code}
              onClick={() => setIssuerCode(i.code)}
              className={cn(
                "min-h-11 rounded-full px-4 text-[14px] font-medium transition-colors",
                issuerCode === i.code
                  ? "bg-[var(--apple-blue)] text-white shadow-[0_2px_8px_rgba(0,122,255,0.25)]"
                  : "glass-button text-[var(--apple-label)]",
              )}
            >
              {i.name}
            </button>
          ))}
        </div>
      </section>

      {/* SIMS 전표 불러오기 — 홀세일만 */}
      {canUseErp && issuerCode === "HOW" && <ErpDocPicker onPick={applyDoc} selected={erpRef} onClear={() => setErpRef(null)} />}

      {/* 공급받는 자 */}
      <section className="glass p-5 sm:p-6 space-y-4">
        <h2 className="text-subheadline font-semibold text-[var(--apple-label)]">공급받는 자</h2>
        <BuyerNameField value={buyerName} onChange={setBuyerName} onPick={applyBuyer} />
        <div className="space-y-1.5">
          <Label htmlFor="ti-biz">사업자등록번호 <span className="text-[var(--apple-red)]">*</span></Label>
          <Input
            id="ti-biz"
            inputMode="numeric"
            placeholder="123-45-67890"
            value={buyerBizNo}
            onChange={(e) => setBuyerBizNo(formatBizNo(e.target.value.replace(/[^\d-]/g, "").slice(0, 12)))}
            className={cn(fieldClass, "tabular-nums")}
            aria-invalid={Boolean(bizWarning)}
          />
          {bizWarning && (
            <p className="flex items-start gap-1.5 text-xs text-[var(--apple-orange)]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {bizWarning}
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ti-ceo">대표자</Label>
            <Input id="ti-ceo" value={buyerCeo} onChange={(e) => setBuyerCeo(e.target.value)} className={fieldClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ti-email">받을 이메일</Label>
            <Input
              id="ti-email"
              type="email"
              inputMode="email"
              placeholder="계산서를 받을 주소"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ti-address">주소</Label>
          <Input id="ti-address" value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} className={fieldClass} />
        </div>
      </section>

      {/* 내용 */}
      <section className="glass p-5 sm:p-6 space-y-4">
        <h2 className="text-subheadline font-semibold text-[var(--apple-label)]">계산서 내용</h2>
        <div className="space-y-1.5">
          <Label htmlFor="ti-items">품목 <span className="text-[var(--apple-red)]">*</span></Label>
          <Textarea id="ti-items" rows={2} value={items} onChange={(e) => setItems(e.target.value)} placeholder="예: 릴리)마운자로 펜 5mg 외 2건" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ti-amount">금액 <span className="text-[var(--apple-red)]">*</span></Label>
          <div className="relative">
            <Input
              id="ti-amount"
              inputMode="numeric"
              placeholder="0"
              value={amountText}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setAmountText(digits ? Number(digits).toLocaleString("ko-KR") : "");
                setExact(null);
              }}
              className={cn(fieldClass, "pr-10 tabular-nums")}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--apple-secondary-label)]">원</span>
          </div>
          {exact ? (
            <p className="text-caption1 text-[var(--apple-secondary-label)]">
              전표 금액 그대로입니다. 금액을 고치면 부가세를 다시 계산합니다.
            </p>
          ) : (
            <VatModeSelect value={vatMode} onChange={setVatMode} />
          )}
          <dl className="grid grid-cols-3 gap-2 rounded-xl bg-[var(--apple-tertiary-system-fill)] px-3 py-2.5 text-center">
            {[
              ["공급가액", breakdown.supply],
              ["부가세", breakdown.vat],
              ["합계", breakdown.total],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-caption2 text-[var(--apple-secondary-label)]">{label}</dt>
                <dd className="text-footnote font-semibold tabular-nums text-[var(--apple-label)]">{won(value as number)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ti-date">작성일자(공급일) <span className="text-[var(--apple-red)]">*</span></Label>
            <Input id="ti-date" type="date" value={supplyDate} onChange={(e) => setSupplyDate(e.target.value)} className={fieldClass} />
            {/^\d{4}-\d{2}-\d{2}$/.test(supplyDate) && (
              <p className="text-caption1 text-[var(--apple-secondary-label)]">
                발행 기한 {issueDeadline(supplyDate).slice(5).replace("-", "월 ")}일까지
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-[var(--apple-label)]">영수/청구</span>
            <div className="inline-flex rounded-full bg-[var(--apple-system-grouped-background)] p-1" role="radiogroup" aria-label="영수/청구">
              {(["CHARGE", "RECEIPT"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={chargeType === c}
                  onClick={() => setChargeType(c)}
                  title={c === "CHARGE" ? "대금을 아직 안 받았음" : "대금을 이미 받았음"}
                  className={cn(
                    "min-h-10 rounded-full px-4 text-[13px] font-medium transition-colors",
                    chargeType === c ? "bg-[var(--apple-blue)] text-white" : "text-[var(--apple-secondary-label)]",
                  )}
                >
                  {CHARGE_TYPE_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ti-memo">관리자에게 메모</Label>
          <Textarea id="ti-memo" rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 월말 합산 발행 원하심, 담당 약사님께 연락 후 발행" />
        </div>
      </section>

      <div className="flex justify-end pb-4">
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="h-11 w-full rounded-full bg-[var(--apple-blue)] px-6 text-white hover:bg-[color-mix(in_srgb,var(--apple-blue)_90%,black)] sm:w-auto"
        >
          {saving ? "보내는 중…" : editing ? "수정 저장" : "발행 요청 보내기"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 거래처 상호 + 찾기(전에 요청한 곳 · ERP 홈택스 매출 계산서 상대방)
// ---------------------------------------------------------------------------

function BuyerNameField({
  value,
  onChange,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (b: BuyerSuggestion) => void;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<BuyerSuggestion[]>([]);
  const typed = useRef(false);

  useEffect(() => {
    // 전표·찾기로 채운 값에는 목록을 띄우지 않는다 — 사람이 친 글자에만.
    if (!typed.current || value.trim().length < 2) return;
    const t = setTimeout(async () => {
      const res = await taxFetch<BuyerSuggestion[]>(`/api/tax-invoices/buyers?q=${encodeURIComponent(value.trim())}`);
      if (res.ok) {
        setResults(res.data);
        setOpen(true);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div className="relative space-y-1.5">
      <Label htmlFor="ti-buyer">상호 <span className="text-[var(--apple-red)]">*</span></Label>
      <Input
        id="ti-buyer"
        value={value}
        autoComplete="off"
        placeholder="예: 행복약국 — 두 글자 넘게 치면 전에 요청한 곳을 찾아 줍니다"
        onChange={(e) => {
          typed.current = true;
          onChange(e.target.value);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={fieldClass}
      />
      {open && value.trim().length >= 2 && results.length > 0 && (
        <ul className="glass-strong absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-2xl p-1.5" role="listbox">
          {results.map((b) => (
            <li key={b.bizNo}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  typed.current = false;
                  onPick(b);
                  setOpen(false);
                }}
                className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-[var(--apple-tertiary-system-fill)]"
              >
                <Building2 className="size-4 shrink-0 text-[var(--apple-secondary-label)]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-[var(--apple-label)]">{b.name}</span>
                  <span className="block text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
                    {formatBizNo(b.bizNo)} · {b.source === "request" ? "전에 요청함" : "홈택스 발행 이력"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SIMS 홀세일 전표 불러오기
// ---------------------------------------------------------------------------

function ErpDocPicker({
  onPick,
  selected,
  onClear,
}: {
  onPick: (doc: ErpSalesDoc) => void;
  selected: { date: string; doc: string } | null;
  onClear: () => void;
}) {
  const [date, setDate] = useState(selected?.date ?? todayKST());
  const [q, setQ] = useState("");
  const [docs, setDocs] = useState<ErpSalesDoc[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ date });
      if (q.trim()) params.set("q", q.trim());
      const res = await taxFetch<ErpSalesDoc[]>(`/api/tax-invoices/erp-docs?${params}`);
      if (!alive) return;
      setLoading(false);
      if (res.ok) setDocs(res.data);
      else toast.error(res.message);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [open, date, q]);

  const visible = useMemo(() => docs ?? [], [docs]);

  return (
    <section className="glass p-5 sm:p-6 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-subheadline font-semibold text-[var(--apple-label)]">
          <FileSpreadsheet className="size-4 text-[var(--apple-green)]" aria-hidden="true" />
          SIMS 전표에서 불러오기
          <span className="text-caption1 font-normal text-[var(--apple-secondary-label)]">(선택)</span>
        </h2>
        {!open && (
          <Button type="button" variant="outline" className="min-h-11 rounded-full" onClick={() => setOpen(true)}>
            전표 찾기
          </Button>
        )}
      </div>
      {selected && (
        <p className="flex flex-wrap items-center gap-2 text-caption1 text-[var(--apple-secondary-label)]">
          <span className="glass-badge glass-badge-green">
            {selected.date.slice(5).replace("-", "/")} 전표 {selected.doc}번
          </span>
          연결됨
          <button type="button" onClick={onClear} className="min-h-11 px-2 text-[var(--apple-blue)]">
            연결 해제
          </button>
        </p>
      )}
      {open && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} aria-label="판매일" />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--apple-tertiary-label)]" aria-hidden="true" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="거래처 이름으로 좁히기" className={cn(fieldClass, "pl-9")} />
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-2xl border border-[var(--apple-separator)]">
            {loading && docs === null ? (
              <p className="px-4 py-6 text-center text-footnote text-[var(--apple-secondary-label)]">불러오는 중…</p>
            ) : visible.length === 0 ? (
              <p className="px-4 py-6 text-center text-footnote text-[var(--apple-secondary-label)]">이 날짜에 전표가 없습니다.</p>
            ) : (
              <ul>
                {visible.map((d) => {
                  const refund = d.total <= 0;
                  return (
                    <li key={d.documentNo} className="border-b border-[var(--apple-separator)] last:border-b-0">
                      <button
                        type="button"
                        disabled={refund}
                        onClick={() => {
                          onPick(d);
                          setOpen(false);
                        }}
                        className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--apple-tertiary-system-fill)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="w-8 shrink-0 text-caption1 tabular-nums text-[var(--apple-secondary-label)]">#{d.documentNo}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium text-[var(--apple-label)]">{d.payeeName}</span>
                          <span className="block truncate text-caption2 text-[var(--apple-secondary-label)]">
                            {refund ? "반품 전표 — 발행 요청 대상이 아닙니다" : d.items}
                          </span>
                        </span>
                        <span className="shrink-0 text-footnote font-semibold tabular-nums text-[var(--apple-label)]">{won(d.total)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
