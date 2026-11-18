"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, Pause, Play } from "lucide-react";
import type { CardSubscriptionRow } from "@/services/card-subscription.service";
import { monthlyEstimate, isStale } from "@/lib/card-subscription";
import { formatExpenseAmount } from "@/lib/utils/expense-utils";

// ---------------------------------------------------------------------------
// 법카 정기 결제 목록(0031) — 「반복 지급」 화면 아래.
// 법카 폼에서 「정기 결제」를 체크한 결제가 (사람 × 가맹점) 단위로 모인다. 돈이 나가는 흐름은 바꾸지 않는다 —
// 매달 얼마가 어디로 나가는지 보고, 안 쓰는 구독을 찾는 용도.
// ---------------------------------------------------------------------------

const ymd = (d: string) => d.replaceAll("-", ".");

export function CardSubscriptionList({
  rows,
  isAdmin,
  today,
}: {
  rows: CardSubscriptionRow[];
  isAdmin: boolean;
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { count, total } = monthlyEstimate(rows);

  async function toggle(r: CardSubscriptionRow) {
    setBusy(r.id);
    try {
      const res = await fetch(`/api/card-subscriptions/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !r.isActive }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "바꾸지 못했습니다.");
      }
      toast.success(r.isActive ? "해지한 구독으로 표시했습니다." : "다시 정기 결제로 켰습니다.");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "바꾸지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-2" aria-label="법카 정기 결제">
      <div className="mt-2">
        <h2 className="inline-flex items-center gap-1.5 text-[17px] font-semibold text-[var(--apple-label)]">
          <CreditCard className="size-[18px] text-[var(--apple-blue)]" />
          법카 정기 결제
        </h2>
        <p className="mt-0.5 text-[13px] text-[var(--apple-secondary-label)]">
          {count > 0
            ? `켜진 구독 ${count}개 · 마지막 결제 기준 한 달 약 ${total.toLocaleString("ko-KR")}원`
            : "법카를 올릴 때 「정기 결제」를 체크하면 여기에 모여요."}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="glass p-6 text-center">
          <p className="text-sm text-[var(--apple-secondary-label)]">아직 정기 결제로 표시한 법카가 없어요.</p>
          <p className="mt-1 text-xs text-[var(--apple-tertiary-label)]">
            AI 구독처럼 매달 카드로 나가는 결제를 올릴 때 가맹점 아래 「정기 결제」를 체크해 주세요. 이미 올린 건은 상세 화면에서 켤 수 있어요.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const stale = r.isActive && isStale(r.lastChargeDate, today);
            return (
              <div
                key={r.id}
                className={`glass flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4 ${
                  r.isActive ? "" : "opacity-60"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-[var(--apple-label)]">{r.title}</span>
                    {r.lastAmount != null && (
                      <span className="tabular-nums text-[var(--apple-secondary-label)]">
                        {formatExpenseAmount(r.lastAmount, r.lastCurrency ?? "KRW", r.lastAmountOriginal)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="glass-badge glass-badge-blue">정기 결제</span>
                    {!r.isActive && <span className="glass-badge">해지</span>}
                    {stale && <span className="glass-badge">45일 넘게 결제 없음</span>}
                    {r.category && <span className="glass-badge">{r.category}</span>}
                  </div>
                  <p className="mt-1 text-[13px] text-[var(--apple-secondary-label)]">
                    {r.merchantName}
                    {r.companyName ? ` · ${r.companyName}` : ""}
                    {isAdmin && r.ownerName ? ` · ${r.ownerName}` : ""}
                    {` · ${r.chargeCount}건`}
                  </p>
                  {r.lastChargeDate && r.lastExpenseId && (
                    <Link
                      href={`/expenses/${r.lastExpenseId}`}
                      className="mt-0.5 inline-block text-[13px] font-medium text-[var(--apple-blue)]"
                    >
                      마지막 결제 {ymd(r.lastChargeDate)}
                    </Link>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busy === r.id || pending}
                    onClick={() => toggle(r)}
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--apple-separator)] px-3 text-[13px] text-[var(--apple-secondary-label)] disabled:opacity-50"
                  >
                    {r.isActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                    {r.isActive ? "해지로 표시" : "다시 켜기"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
