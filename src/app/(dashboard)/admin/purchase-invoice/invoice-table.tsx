"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Undo2 } from "lucide-react";
import type { PurchaseInvoiceMonth } from "@/services/expense.service";

function won(n: number) {
  return `${n.toLocaleString("ko-KR")}원`;
}

function ymd(s: string) {
  return s.replaceAll("-", ".");
}

interface Props {
  months: PurchaseInvoiceMonth[];
}

// ---------------------------------------------------------------------------
// 월별 사입 → 세금계산서 발행 관리.
//
// 미발행이 남은 달을 위로 올리고(서비스에서 정렬), 그 달 헤더에 **아직 발행할
// 금액**을 크게 띄운다. 이 화면의 목적은 "얼마 썼나"가 아니라 "무엇을 아직
// 발행 안 했나"이기 때문이다.
// ---------------------------------------------------------------------------
export function InvoiceTable({ months }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(id: string, issued: boolean) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/expenses/${id}/invoice-issued`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issued }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? "변경에 실패했습니다.");
      }
      toast.success(issued ? "발행 완료로 표시했습니다" : "미발행으로 되돌렸습니다");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "변경에 실패했습니다.");
    } finally {
      setBusyId(null);
    }
  }

  if (months.length === 0) {
    return (
      <div className="glass p-8 text-center">
        <p className="text-sm text-[var(--apple-secondary-label)]">
          사입으로 표시된 건이 없습니다.
        </p>
        <p className="mt-1 text-xs text-[var(--apple-tertiary-label)]">
          비용 등록 화면에서 &ldquo;사입&rdquo;을 체크하면 여기에 모입니다.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {months.map((m) => {
        const done = m.unissuedCount === 0;
        return (
          <section key={m.yearMonth} className="glass overflow-hidden">
            {/* 월 헤더 */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--apple-separator)] p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">
                  {ymd(m.yearMonth)}
                </h2>
                <span
                  className={
                    done
                      ? "glass-badge glass-badge-green"
                      : "glass-badge glass-badge-orange"
                  }
                >
                  {done ? "발행 완료" : `미발행 ${m.unissuedCount}건`}
                </span>
                <span className="text-xs text-[var(--apple-tertiary-label)]">
                  기한 {ymd(m.dueDate)}
                </span>
              </div>
              <div className="text-right">
                {!done && (
                  <p className="text-[15px] font-semibold tabular-nums text-[var(--apple-orange)]">
                    발행할 금액 {won(m.unissuedTotal)}
                  </p>
                )}
                <p className="text-xs tabular-nums text-[var(--apple-secondary-label)]">
                  합계 {won(m.totalAmount)} (공급 {won(m.totalSupply)} + 부가세{" "}
                  {won(m.totalVat)})
                </p>
              </div>
            </div>

            {/* 표 — 좁은 화면에서는 가로 스크롤 */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--apple-secondary-label)]">
                    <th className="px-3 py-2 font-medium sm:px-4">거래일</th>
                    <th className="px-3 py-2 font-medium sm:px-4">약국</th>
                    <th className="px-3 py-2 font-medium sm:px-4">품목·수량</th>
                    <th className="px-3 py-2 text-right font-medium sm:px-4">공급가액</th>
                    <th className="px-3 py-2 text-right font-medium sm:px-4">부가세</th>
                    <th className="px-3 py-2 text-right font-medium sm:px-4">합계</th>
                    <th className="px-3 py-2 text-right font-medium sm:px-4">발행</th>
                  </tr>
                </thead>
                <tbody>
                  {m.rows.map((r) => {
                    const issued = !!r.invoiceIssuedAt;
                    return (
                      <tr
                        key={r.id}
                        className="border-t border-[var(--apple-separator)] align-top"
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-[var(--apple-secondary-label)] sm:px-4">
                          {ymd(r.transactionDate)}
                        </td>
                        <td className="px-3 py-2.5 sm:px-4">
                          <Link
                            href={`/expenses/${r.id}`}
                            className="font-medium text-[var(--apple-label)] hover:underline"
                          >
                            {r.pharmacyName ?? "—"}
                          </Link>
                          {r.pharmacyBizNo && (
                            <p className="text-xs tabular-nums text-[var(--apple-tertiary-label)]">
                              {r.pharmacyBizNo}
                            </p>
                          )}
                        </td>
                        <td className="max-w-[220px] px-3 py-2.5 text-[var(--apple-secondary-label)] sm:px-4">
                          {r.purchaseItems ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums sm:px-4">
                          {won(r.supplyAmount)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--apple-secondary-label)] sm:px-4">
                          {won(r.vat)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums sm:px-4">
                          {won(r.total)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right sm:px-4">
                          <button
                            type="button"
                            disabled={busyId === r.id || pending}
                            onClick={() => toggle(r.id, !issued)}
                            className={
                              issued
                                ? "inline-flex h-8 items-center gap-1 rounded-full border border-[var(--apple-separator)] px-3 text-xs text-[var(--apple-secondary-label)] disabled:opacity-50"
                                : "inline-flex h-8 items-center gap-1 rounded-full bg-[var(--apple-blue)] px-3 text-xs font-medium text-white disabled:opacity-50"
                            }
                          >
                            {issued ? (
                              <>
                                <Undo2 className="size-3.5" /> 되돌리기
                              </>
                            ) : (
                              <>
                                <Check className="size-3.5" /> 발행 완료
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
