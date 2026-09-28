"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, FileSpreadsheet, Pencil, Plus, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CHARGE_TYPE_LABEL,
  TAX_INVOICE_STATUS_LABEL,
  formatBizNo,
  issueDeadline,
  type ChargeType,
  type TaxInvoiceStatus,
} from "@/lib/tax-invoice";
import type { TaxInvoiceView } from "@/services/tax-invoice.service";
import { taxFetch, todayKST, won } from "./api";

// ---------------------------------------------------------------------------
// 세금계산서 발행 요청 목록. 발행 대기가 위(오래된 것부터 — 놓치지 않게).
// 관리자: 홈택스에서 발행한 뒤 "발행 완료". 잘못 눌렀으면 되돌린다(사입 계산서와 같은 이유).
// ---------------------------------------------------------------------------

type Filter = "REQUESTED" | "ISSUED" | "CANCELLED" | "ALL";

const STATUS_BADGE: Record<TaxInvoiceStatus, string> = {
  REQUESTED: "glass-badge glass-badge-orange",
  ISSUED: "glass-badge glass-badge-green",
  CANCELLED: "glass-badge glass-badge-gray",
};

function mmdd(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

function kstStamp(isoString: string): string {
  const d = new Date(new Date(isoString).getTime() + 9 * 3_600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function TaxInvoiceList({
  items,
  isAdmin,
  focusId,
}: {
  items: TaxInvoiceView[];
  isAdmin: boolean;
  focusId?: string;
}) {
  const counts = useMemo(() => {
    const c = { REQUESTED: 0, ISSUED: 0, CANCELLED: 0 };
    for (const i of items) c[i.status] += 1;
    return c;
  }, [items]);
  const focused = items.find((i) => i.id === focusId);
  const [filter, setFilter] = useState<Filter>(focused ? (focused.status as Filter) : counts.REQUESTED > 0 ? "REQUESTED" : "ALL");
  const visible = filter === "ALL" ? items : items.filter((i) => i.status === filter);
  const pendingTotal = items.filter((i) => i.status === "REQUESTED").reduce((a, i) => a + i.total, 0);
  const overdue = items.filter((i) => i.status === "REQUESTED" && issueDeadline(i.supplyDate) < todayKST()).length;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">세금계산서 발행 요청</h1>
          <p className="mt-0.5 text-footnote text-[var(--apple-secondary-label)]">
            {isAdmin
              ? "홈택스에서 발행한 뒤 「발행 완료」를 누르면 요청한 사람에게 알림이 갑니다."
              : "내가 보낸 요청입니다. 관리자가 발행하면 알림이 옵니다."}
          </p>
        </div>
        <Link
          href="/tax-invoices/new"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--apple-blue)] px-5 text-[15px] font-medium text-white shadow-[0_2px_8px_rgba(0,122,255,0.25)] apple-press"
        >
          <Plus className="size-4" aria-hidden="true" />
          새 요청
        </Link>
      </div>

      {counts.REQUESTED > 0 && (
        <div
          className={cn(
            "rounded-xl border p-4 text-footnote",
            overdue > 0
              ? "border-[var(--apple-red)]/20 bg-[var(--apple-red)]/10 text-[var(--apple-label)]"
              : "border-[var(--apple-orange)]/20 bg-[var(--apple-orange)]/10 text-[var(--apple-label)]",
          )}
        >
          발행 대기 <strong className="tabular-nums">{counts.REQUESTED}건</strong> · 합계{" "}
          <strong className="tabular-nums">{won(pendingTotal)}</strong>
          {overdue > 0 && (
            <span className="text-[var(--apple-red)]"> · 발행 기한(공급일 다음 달 10일)을 넘긴 건 {overdue}건</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="상태">
        {(
          [
            ["REQUESTED", `발행 대기 ${counts.REQUESTED}`],
            ["ISSUED", `발행 완료 ${counts.ISSUED}`],
            ["CANCELLED", `취소 ${counts.CANCELLED}`],
            ["ALL", `전체 ${items.length}`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              "min-h-11 rounded-full px-4 text-[14px] font-medium tabular-nums transition-colors",
              filter === key
                ? "bg-[var(--apple-blue)] text-white shadow-[0_2px_8px_rgba(0,122,255,0.25)]"
                : "glass-button text-[var(--apple-label)]",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="glass px-6 py-12 text-center">
          <p className="text-headline text-[var(--apple-label)]">요청이 없습니다</p>
          <p className="mt-1 text-footnote text-[var(--apple-secondary-label)]">
            약국·의원에 판 건의 세금계산서가 필요하면 「새 요청」을 눌러주세요.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((item) => (
            <RequestCard key={item.id} item={item} isAdmin={isAdmin} focused={item.id === focusId} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ item, isAdmin, focused }: { item: TaxInvoiceView; isAdmin: boolean; focused: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const lock = useRef(false);

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  const run = useCallback(
    async (url: string, body: unknown, success: string) => {
      if (lock.current) return;
      lock.current = true;
      setBusy(true);
      const res = await taxFetch(url, { method: "POST", body: JSON.stringify(body) });
      setBusy(false);
      lock.current = false;
      if (!res.ok) return toast.error(res.message);
      toast.success(success);
      setCancelOpen(false);
      router.refresh();
    },
    [router],
  );

  const copy = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}을(를) 복사했습니다.`);
    } catch {
      toast.error("복사하지 못했습니다.");
    }
  }, []);

  const overdue = item.status === "REQUESTED" && issueDeadline(item.supplyDate) < todayKST();

  return (
    <article
      ref={ref}
      className={cn(
        "glass-card flex flex-col gap-3 p-4 sm:p-5",
        focused && "ring-2 ring-[var(--apple-blue)]",
        item.status === "CANCELLED" && "opacity-60",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={STATUS_BADGE[item.status]}>{TAX_INVOICE_STATUS_LABEL[item.status]}</span>
            <span className="glass-badge glass-badge-blue">{item.issuerName}</span>
            <span className="text-caption2 text-[var(--apple-secondary-label)]">{CHARGE_TYPE_LABEL[item.chargeType as ChargeType] ?? item.chargeType}</span>
          </div>
          <h2 className="mt-1.5 truncate text-[16px] font-semibold text-[var(--apple-label)]">{item.buyerName}</h2>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[17px] font-semibold tabular-nums text-[var(--apple-label)]">{won(item.total)}</p>
          <p className="text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
            공급가 {item.supplyAmount.toLocaleString("ko-KR")} · 세액 {item.vatAmount.toLocaleString("ko-KR")}
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-footnote">
        <dt className="text-[var(--apple-secondary-label)]">사업자번호</dt>
        <dd className="flex items-center gap-1 tabular-nums text-[var(--apple-label)]">
          {formatBizNo(item.buyerBizNo)}
          <button
            type="button"
            onClick={() => void copy(item.buyerBizNo, "사업자번호")}
            aria-label="사업자번호 복사"
            className="flex size-8 items-center justify-center rounded-full text-[var(--apple-secondary-label)] hover:bg-[var(--apple-tertiary-system-fill)]"
          >
            <Copy className="size-3.5" aria-hidden="true" />
          </button>
        </dd>
        {(item.buyerCeo || item.buyerEmail) && (
          <>
            <dt className="text-[var(--apple-secondary-label)]">대표·이메일</dt>
            <dd className="min-w-0 break-all text-[var(--apple-label)]">
              {[item.buyerCeo, item.buyerEmail].filter(Boolean).join(" · ")}
            </dd>
          </>
        )}
        {item.buyerAddress && (
          <>
            <dt className="text-[var(--apple-secondary-label)]">주소</dt>
            <dd className="min-w-0 text-[var(--apple-label)]">{item.buyerAddress}</dd>
          </>
        )}
        <dt className="text-[var(--apple-secondary-label)]">품목</dt>
        <dd className="min-w-0 break-words text-[var(--apple-label)]">{item.items}</dd>
        <dt className="text-[var(--apple-secondary-label)]">작성일자</dt>
        <dd className="tabular-nums text-[var(--apple-label)]">
          {item.supplyDate.replaceAll("-", ".")}
          {item.status === "REQUESTED" && (
            <span className={cn("ml-2 text-caption1", overdue ? "text-[var(--apple-red)]" : "text-[var(--apple-secondary-label)]")}>
              기한 {mmdd(issueDeadline(item.supplyDate))}
              {overdue && " 지남"}
            </span>
          )}
        </dd>
        {item.erpDocumentNo && item.erpSalesDate && (
          <>
            <dt className="text-[var(--apple-secondary-label)]">SIMS 전표</dt>
            <dd className="flex items-center gap-1 text-[var(--apple-label)]">
              <FileSpreadsheet className="size-3.5 text-[var(--apple-green)]" aria-hidden="true" />
              {mmdd(item.erpSalesDate)} · {item.erpDocumentNo}번
            </dd>
          </>
        )}
        {item.memo && (
          <>
            <dt className="text-[var(--apple-secondary-label)]">메모</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words text-[var(--apple-label)]">{item.memo}</dd>
          </>
        )}
      </dl>

      <p className="text-caption1 text-[var(--apple-secondary-label)]">
        {item.requestedByName ?? "알 수 없음"} · {kstStamp(item.createdAt)} 요청
        {item.issuedAt && ` · ${item.issuedByName ?? "관리자"} ${kstStamp(item.issuedAt)} 발행 처리`}
        {item.cancelledAt && ` · ${kstStamp(item.cancelledAt)} 취소${item.cancelReason ? ` (${item.cancelReason})` : ""}`}
      </p>

      {isAdmin && item.hometaxMatch && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--apple-green)]/20 bg-[var(--apple-green)]/10 p-3 text-footnote text-[var(--apple-label)]">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--apple-green)]" aria-hidden="true" />
          <span>
            홈택스에 같은 계산서가 보입니다({mmdd(item.hometaxMatch.issueDate)} 발행 · {won(item.hometaxMatch.total)}).
            이미 발행했다면 「발행 완료」를 눌러주세요.
          </span>
        </div>
      )}

      {(item.canEdit || (isAdmin && item.status !== "CANCELLED")) && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--apple-separator)] pt-3">
          {item.canEdit && (
            <>
              <Button type="button" variant="ghost" className="min-h-11 rounded-full text-[var(--apple-red)]" onClick={() => setCancelOpen(true)} disabled={busy}>
                <XCircle className="size-4" aria-hidden="true" />
                요청 취소
              </Button>
              <Link
                href={`/tax-invoices/${item.id}/edit`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium text-[var(--apple-label)] glass-button"
              >
                <Pencil className="size-4" aria-hidden="true" />
                수정
              </Link>
            </>
          )}
          {isAdmin && item.status === "REQUESTED" && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void run(`/api/tax-invoices/${item.id}/issued`, { issued: true }, "발행 완료로 처리했습니다.")}
              className="min-h-11 rounded-full bg-[var(--apple-green)] px-5 text-white hover:bg-[color-mix(in_srgb,var(--apple-green)_90%,black)]"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              발행 완료
            </Button>
          )}
          {isAdmin && item.status === "ISSUED" && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void run(`/api/tax-invoices/${item.id}/issued`, { issued: false }, "발행 대기로 되돌렸습니다.")}
              className="min-h-11 rounded-full"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              발행 완료 취소
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={cancelOpen} onOpenChange={(next) => !busy && setCancelOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>발행 요청 취소</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{item.buyerName}</strong> {won(item.total)} 요청을 취소합니다. 기록은 「취소」 탭에 남습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유(선택)" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>닫기</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void run(`/api/tax-invoices/${item.id}/cancel`, { reason: reason.trim() || null }, "요청을 취소했습니다.")}
            >
              {busy ? "취소하는 중…" : "요청 취소"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
