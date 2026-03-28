"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/validations/expense-form";
import { SwipeableGroup, SwipeableRow, type SwipeAction } from "@/components/ui/swipeable-row";
import { CreditCard, Banknote, ArrowRight, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ExpenseStatus } from "@/types";

const STATUS_LABELS: Record<ExpenseStatus, { label: string; className: string }> = {
  SUBMITTED: { label: "제출", className: "glass-badge glass-badge-blue" },
  APPROVED: { label: "승인", className: "glass-badge glass-badge-green" },
  REJECTED: { label: "반려", className: "glass-badge glass-badge-red" },
  CANCELLED: { label: "취소", className: "glass-badge glass-badge-gray" },
};

function formatDateKR(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

interface Expense {
  id: string;
  title: string;
  amount: number;
  status: string;
  type: string;
  created_at: string;
  is_urgent?: boolean;
}

type TabType = "CORPORATE_CARD" | "DEPOSIT_REQUEST";

export function ExpenseTabList({ expenses }: { expenses: Expense[] }) {
  const [activeTab, setActiveTab] = useState<TabType>("CORPORATE_CARD");

  const filtered = expenses.filter((e) => e.type === activeTab);

  return (
    <>
      {/* Tab buttons */}
      <div className="flex items-center gap-2 sm:gap-3 animate-fade-up-2" role="tablist" aria-label="비용 유형">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "CORPORATE_CARD"}
          onClick={() => setActiveTab("CORPORATE_CARD")}
          className={cn(
            "inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 text-[13px] sm:text-sm font-medium rounded-full sm:rounded-full apple-press transition-all duration-200",
            activeTab === "CORPORATE_CARD"
              ? "bg-[var(--apple-blue)] text-white shadow-[0_2px_8px_rgba(0,122,255,0.25)]"
              : "glass-button text-[var(--apple-label)]"
          )}
        >
          <CreditCard className="size-3.5 sm:size-4" />
          법카사용 내역
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "DEPOSIT_REQUEST"}
          onClick={() => setActiveTab("DEPOSIT_REQUEST")}
          className={cn(
            "inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 text-[13px] sm:text-sm font-medium rounded-full sm:rounded-full apple-press transition-all duration-200",
            activeTab === "DEPOSIT_REQUEST"
              ? "bg-[var(--apple-blue)] text-white shadow-[0_2px_8px_rgba(0,122,255,0.25)]"
              : "glass-button text-[var(--apple-label)]"
          )}
        >
          <Banknote className="size-3.5 sm:size-4" />
          입금요청
        </button>
      </div>

      {/* Filtered list */}
      <div className="animate-fade-up-3">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-[15px] sm:text-base font-semibold text-[var(--apple-label)]">최근 제출</h2>
          <Link
            href={`/expenses?type=${activeTab}`}
            className="inline-flex items-center gap-1 text-[13px] sm:text-sm text-[var(--apple-blue)] hover:text-[color-mix(in_srgb,var(--apple-blue)_85%,black)] hover:underline underline-offset-2 font-medium transition-all duration-200"
          >
            전체 보기
            <ArrowRight className="size-3 sm:size-3.5" />
          </Link>
        </div>

        {filtered.length === 0 ? (
          <div className="py-8 sm:py-10 text-center">
            <p className="text-[13px] sm:text-sm text-[var(--apple-secondary-label)]">
              {activeTab === "CORPORATE_CARD" ? "법카사용 내역이 없습니다." : "입금요청 내역이 없습니다."}
            </p>
          </div>
        ) : (
          <SwipeableGroup>
            <div className="flex flex-col gap-2.5">
              {filtered.map((expense, idx) => (
                <DashboardExpenseRow key={expense.id} expense={expense} idx={idx} />
              ))}
            </div>
          </SwipeableGroup>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Dashboard expense row with swipe actions (mobile)
// ---------------------------------------------------------------------------

function DashboardExpenseRow({ expense, idx }: { expense: Expense; idx: number }) {
  const router = useRouter();
  const statusInfo =
    STATUS_LABELS[expense.status as ExpenseStatus] ?? STATUS_LABELS.SUBMITTED;

  const canEdit = expense.status === "SUBMITTED";
  const canDelete = ["SUBMITTED", "CANCELLED"].includes(expense.status);

  const actions: SwipeAction[] = useMemo(() => {
    const result: SwipeAction[] = [];

    if (canEdit) {
      result.push({
        key: "edit",
        icon: <Pencil className="size-5" strokeWidth={2} />,
        label: "수정",
        color: "var(--apple-orange)",
        onAction: () => router.push(`/expenses/${expense.id}/edit`),
      });
    }

    if (canDelete) {
      result.push({
        key: "delete",
        icon: <Trash2 className="size-5" strokeWidth={2} />,
        label: "삭제",
        color: "var(--apple-red)",
        requireConfirm: true,
        confirmLabel: "확인?",
        onAction: async () => {
          try {
            const res = await fetch(`/api/expenses/${expense.id}`, { method: "DELETE" });
            if (res.ok) {
              toast.success("삭제되었습니다.");
              router.refresh();
            } else {
              const json = await res.json().catch(() => null);
              toast.error(json?.error?.message ?? "삭제에 실패했습니다.");
            }
          } catch {
            toast.error("요청 중 오류가 발생했습니다.");
          }
        },
      });
    }

    return result;
  }, [expense.id, expense.status, canEdit, canDelete, router]);

  const handleTap = useCallback(() => {
    router.push(`/expenses/${expense.id}`);
  }, [expense.id, router]);

  return (
    <SwipeableRow
      id={`dashboard-${expense.id}`}
      actions={actions}
      onTap={handleTap}
      className="rounded-xl"
      enabled={actions.length > 0}
    >
      <div
        className={cn(
          "relative flex flex-col gap-2 p-3.5 sm:p-4 rounded-xl",
          "bg-[var(--apple-system-background)] border border-[var(--glass-border)] shadow-sm",
          "cursor-pointer apple-press transition-all duration-200",
          "animate-row-enter",
          `stagger-${idx + 3}`
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] sm:text-sm font-medium text-[var(--apple-label)] truncate flex items-center gap-1.5">
            <span className="truncate">{expense.title}</span>
            {expense.is_urgent && <span className="glass-badge glass-badge-red shrink-0">긴급</span>}
          </p>
          <span className={cn(statusInfo.className, "shrink-0")}>
            {statusInfo.label}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] sm:text-xs text-[var(--apple-secondary-label)]">
            {formatDateKR(expense.created_at)}
          </span>
          <span className="text-[13px] sm:text-sm font-medium tabular-nums text-[var(--apple-label)]">
            {formatAmount(expense.amount)}원
          </span>
        </div>
      </div>
    </SwipeableRow>
  );
}
