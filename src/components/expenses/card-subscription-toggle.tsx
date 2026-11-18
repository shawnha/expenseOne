"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// 법카 상세의 「정기 결제」 켜고 끄기(0031). 이미 올린 구독 결제를 나중에 표시할 때 쓴다.
export function CardSubscriptionToggle({ expenseId, marked }: { expenseId: string; marked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/expenses/${expenseId}/card-subscription`, { method: marked ? "DELETE" : "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message ?? "바꾸지 못했습니다.");
      }
      toast.success(marked ? "정기 결제 표시를 뗐습니다." : "정기 결제로 표시했습니다.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "바꾸지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="inline-flex h-8 items-center rounded-full border border-[var(--apple-separator)] px-3 text-[13px] text-[var(--apple-label)] disabled:opacity-50"
    >
      {marked ? "표시 해제" : "정기 결제로 표시"}
    </button>
  );
}
