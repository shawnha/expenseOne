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
// 월별 사입 → 약국별 세금계산서 발행 관리.
//
// 사입 한 건 안에 약국이 여럿일 수 있다(한 번 들여와 여러 곳에 납품). 그래서
// 비용 한 건을 묶음으로 보여주고, **발행 체크는 약국 줄마다** 둔다 — 계산서는
// 공급받는자가 한 명이라 보통 약국 수만큼 발행하기 때문이다.
//
// 다만 같은 사업자의 여러 지점이라 한 장으로 처리하는 경우도 있어서, 묶음
// 헤더에 「남은 N곳 한꺼번에」를 둔다.
// ---------------------------------------------------------------------------
export function InvoiceTable({ months }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(lineIds: string[], issued: boolean, busyKey: string) {
    setBusy(busyKey);
    try {
      const res = await fetch("/api/purchase-invoice/issued", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineIds, issued }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? "변경에 실패했습니다.");
      }
      toast.success(
        issued
          ? `발행 완료로 표시했습니다${lineIds.length > 1 ? ` (${lineIds.length}곳)` : ""}`
          : "미발행으로 되돌렸습니다",
      );
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "변경에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  if (months.length === 0) {
    return (
      <div className="glass p-8 text-center">
        <p className="text-sm text-[var(--apple-secondary-label)]">
          해당하는 사입 건이 없습니다.
        </p>
        <p className="mt-1 text-xs text-[var(--apple-tertiary-label)]">
          비용 등록 화면에서 &ldquo;사입&rdquo;을 체크하고 약국을 넣으면 여기에 모입니다.
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--apple-separator)] p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">
                  {ymd(m.yearMonth)}
                </h2>
                <span
                  className={
                    done ? "glass-badge glass-badge-green" : "glass-badge glass-badge-orange"
                  }
                >
                  {done ? "발행 완료" : `미발행 ${m.unissuedCount}곳`}
                </span>
                <span className="text-xs text-[var(--apple-tertiary-label)]">
                  계산서 {m.lineCount}장 · 기한 {ymd(m.dueDate)}
                </span>
              </div>
              <div className="text-right">
                {!done && (
                  <p className="text-[15px] font-semibold tabular-nums text-[var(--apple-orange)]">
                    발행할 금액 {won(m.unissuedTotal)}
                  </p>
                )}
                <p className="text-xs tabular-nums text-[var(--apple-secondary-label)]">
                  합계 {won(m.totalAmount)} (공급 {won(m.totalSupply)} + 부가세 {won(m.totalVat)})
                </p>
              </div>
            </div>

            <div className="flex flex-col">
              {m.expenses.map((exp) => {
                const unissuedIds = exp.lines
                  .filter((l) => !l.invoiceIssuedAt)
                  .map((l) => l.id);
                return (
                  <div
                    key={exp.id}
                    className="border-b border-[var(--apple-separator)] last:border-b-0"
                  >
                    {/* 사입 건 헤더 — 약국이 여럿이면 여기서 한꺼번에 처리할 수 있다 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--apple-system-grouped-background)]/40 px-3 py-2 sm:px-4">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-xs tabular-nums text-[var(--apple-secondary-label)]">
                          {ymd(exp.transactionDate)}
                        </span>
                        <Link
                          href={`/expenses/${exp.id}`}
                          className="text-[13px] font-medium text-[var(--apple-label)] hover:underline"
                        >
                          {exp.title}
                        </Link>
                        <span className="text-xs text-[var(--apple-tertiary-label)]">
                          약국 {exp.lines.length}곳 · 매입 {won(exp.cost)}
                        </span>
                      </div>
                      {unissuedIds.length > 1 && (
                        <button
                          type="button"
                          disabled={busy === `exp-${exp.id}` || pending}
                          onClick={() => toggle(unissuedIds, true, `exp-${exp.id}`)}
                          className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--apple-blue)] px-2.5 text-xs text-[var(--apple-blue)] disabled:opacity-50"
                          title="계산서 한 장으로 처리한 경우 한꺼번에 표시합니다"
                        >
                          <Check className="size-3" /> 남은 {unissuedIds.length}곳 한꺼번에
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[700px] text-sm">
                        <tbody>
                          {exp.lines.map((l) => {
                            const issued = !!l.invoiceIssuedAt;
                            return (
                              <tr
                                key={l.id}
                                className="border-t border-[var(--apple-separator)] align-top first:border-t-0"
                              >
                                <td className="px-3 py-2.5 sm:px-4">
                                  <span className="font-medium text-[var(--apple-label)]">
                                    {l.pharmacyName}
                                  </span>
                                  {l.pharmacyBizNo && (
                                    <p className="text-xs tabular-nums text-[var(--apple-tertiary-label)]">
                                      {l.pharmacyBizNo}
                                    </p>
                                  )}
                                </td>
                                <td className="max-w-[220px] px-3 py-2.5 text-[var(--apple-secondary-label)] sm:px-4">
                                  {l.purchaseItems ?? "—"}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums sm:px-4">
                                  {won(l.supplyAmount)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--apple-secondary-label)] sm:px-4">
                                  +{won(l.vat)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums sm:px-4">
                                  {won(l.total)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right sm:px-4">
                                  <button
                                    type="button"
                                    disabled={busy === l.id || pending}
                                    onClick={() => toggle([l.id], !issued, l.id)}
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
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
