"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BRANCH_OPTIONS } from "@/lib/validations/expense-form";
import { cn } from "@/lib/utils";

type BranchCode = (typeof BRANCH_OPTIONS)[number]["value"];

interface BranchSelectProps {
  expenseId: string;
  value: string | null;
  /** 반품(REFUND) 등 수정 불가 건 */
  disabled?: boolean;
}

/**
 * 마트/약국 목록에서 각 비용의 호점(1호점/2호점)을 인라인으로 지정한다.
 * - 비활성(미지정) 상태에서 칩을 누르면 해당 호점으로 지정
 * - 이미 지정된 칩을 다시 누르면 미지정으로 해제
 * 변경 즉시 PATCH /api/expenses/[id] 로 저장하고 서버 데이터를 새로고침한다.
 */
export function BranchSelect({ expenseId, value, disabled = false }: BranchSelectProps) {
  const router = useRouter();
  const [current, setCurrent] = useState<string | null>(value);
  const [saving, setSaving] = useState(false);

  async function apply(next: BranchCode | null) {
    if (saving) return;
    const prev = current;
    setCurrent(next); // optimistic
    setSaving(true);
    try {
      const res = await fetch(`/api/expenses/${expenseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error?.message || "호점 지정에 실패했습니다.");
      }
      router.refresh();
    } catch (error) {
      setCurrent(prev); // revert
      toast.error(error instanceof Error ? error.message : "호점 지정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1" role="group" aria-label="호점 지정">
      {BRANCH_OPTIONS.map((opt) => {
        const isActive = current === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled || saving}
            aria-pressed={isActive}
            onClick={() => apply(isActive ? null : opt.value)}
            className={cn(
              "shrink-0 h-7 rounded-full px-2.5 text-[12px] font-medium tabular-nums transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,122,255,0.4)]",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              isActive
                ? "bg-[var(--apple-blue)] text-white"
                : "bg-[rgba(0,0,0,0.04)] dark:bg-[rgba(255,255,255,0.06)] text-[var(--apple-secondary-label)] hover:bg-[rgba(0,0,0,0.08)] dark:hover:bg-[rgba(255,255,255,0.10)]",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
