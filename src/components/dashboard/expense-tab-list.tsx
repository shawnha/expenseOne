"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/validations/expense-form";
import { CreditCard, Banknote, ArrowRight } from "lucide-react";
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
      <div className="flex items-center gap-2 sm:gap-3 animate-fade-up-2">
        <button
          type="button"
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
      <div className="glass-card p-3 sm:p-4 lg:p-5 animate-fade-up-3">
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
          <div className="glass-subtle p-6 sm:p-8 text-center">
            <p className="text-[13px] sm:text-sm text-[var(--apple-secondary-label)]">
              {activeTab === "CORPORATE_CARD" ? "법카사용 내역이 없습니다." : "입금요청 내역이 없습니다."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--apple-separator)]">
            {filtered.map((expense, idx) => {
              const statusInfo =
                STATUS_LABELS[expense.status as ExpenseStatus] ?? STATUS_LABELS.SUBMITTED;
              return (
                <Link
                  key={expense.id}
                  href={`/expenses/${expense.id}`}
                  className={cn(
                    "flex items-center justify-between gap-2 sm:gap-3 py-2.5 sm:py-3 hover:bg-[rgba(0,0,0,0.03)] rounded-lg px-2 -mx-2 apple-press transition-all duration-200",
                    "animate-row-enter",
                    `stagger-${idx + 3}`
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] sm:text-[15px] font-medium text-[var(--apple-label)] truncate flex items-center gap-1.5">
                      <span className="truncate">{expense.title}</span>
                      {expense.is_urgent && <span className="glass-badge glass-badge-red shrink-0">긴급</span>}
                    </p>
                    <p className="text-[11px] sm:text-xs text-[var(--apple-secondary-label)] mt-0.5">
                      {formatDateKR(expense.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    <span className="text-[13px] sm:text-sm font-medium tabular-nums text-[var(--apple-label)]">
                      {formatAmount(expense.amount)}원
                    </span>
                    <span className={cn(statusInfo.className)}>
                      {statusInfo.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
