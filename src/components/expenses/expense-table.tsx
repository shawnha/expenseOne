"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SwipeableGroup, SwipeableRow, type SwipeAction } from "@/components/ui/swipeable-row";
import { formatAmount } from "@/lib/validations/expense-form";
import { getCategoryLabel, formatExpenseAmount } from "@/lib/utils/expense-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { AdminQuickEditDialog } from "@/components/expenses/admin-quick-edit-dialog";
import type { ExpenseType, ExpenseStatus } from "@/types";

interface ExpenseRow {
  id: string;
  type: ExpenseType;
  status: ExpenseStatus;
  title: string;
  amount: number;
  currency?: string | null;
  amountOriginal?: number | null;
  category: string;
  createdAt: string;
  submitter: {
    id: string;
    name: string;
    email: string;
  } | null;
  isUrgent?: boolean;
  companyName?: string | null;
  companySlug?: string | null;
}

interface ExpenseTableProps {
  expenses: ExpenseRow[];
  showSubmitter?: boolean;
  isAdmin?: boolean;
}

const TYPE_LABELS: Record<ExpenseType, { label: string; className: string }> = {
  CORPORATE_CARD: {
    label: "법카사용",
    className: "glass-badge glass-badge-blue",
  },
  DEPOSIT_REQUEST: {
    label: "입금요청",
    className: "glass-badge glass-badge-orange",
  },
};

const STATUS_LABELS: Record<ExpenseStatus, { label: string; className: string }> = {
  SUBMITTED: {
    label: "제출",
    className: "glass-badge glass-badge-blue",
  },
  APPROVED: {
    label: "승인",
    className: "glass-badge glass-badge-green",
  },
  REJECTED: {
    label: "반려",
    className: "glass-badge glass-badge-red",
  },
  CANCELLED: {
    label: "취소",
    className: "glass-badge glass-badge-gray",
  },
};

const COMPANY_BADGE_STYLES: Record<string, string> = {
  korea: "bg-[rgba(0,122,255,0.1)] text-[#007AFF] dark:bg-[rgba(0,122,255,0.2)]",
  retail: "bg-[rgba(52,199,89,0.1)] text-[#34C759] dark:bg-[rgba(52,199,89,0.2)]",
};

function CompanyBadge({ name, slug }: { name: string; slug: string }) {
  const style = COMPANY_BADGE_STYLES[slug] ?? "bg-[rgba(142,142,147,0.1)] text-[var(--apple-secondary-label)]";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap", style)}>
      {name}
    </span>
  );
}

function formatDateKR(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

export function ExpenseTable({ expenses, showSubmitter = false, isAdmin = false }: ExpenseTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editExpense, setEditExpense] = useState<ExpenseRow | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const handleAdminDelete = useCallback(async (expenseId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmId !== expenseId) {
      setConfirmId(expenseId);
      return;
    }
    setDeletingId(expenseId);
    try {
      const res = await fetch(`/api/expenses/${expenseId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("삭제되었습니다.");
        router.refresh();
      } else {
        const json = await res.json().catch(() => null);
        toast.error(json?.error?.message ?? "삭제에 실패했습니다.");
      }
    } catch {
      toast.error("요청 중 오류가 발생했습니다.");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }, [confirmId, router]);

  const handleQuickEdit = useCallback((expense: ExpenseRow) => {
    router.push(`/expenses/${expense.id}/edit`);
  }, [router]);

  return (
    <>
      {/* Desktop table */}
      <div className="hidden lg:block glass p-4 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[140px]">제목</TableHead>
              <TableHead className="w-[80px]">유형</TableHead>
              <TableHead className="w-[120px] text-right pr-6">금액</TableHead>
              <TableHead className="w-[100px]">카테고리</TableHead>
              <TableHead className="w-[72px]">상태</TableHead>
              <TableHead className="w-[100px]">제출일</TableHead>
              {showSubmitter && <TableHead className="w-[80px]">제출자</TableHead>}
              {showSubmitter && <TableHead className="w-[100px]">회사</TableHead>}
              {isAdmin && <TableHead className="text-center w-[100px]">작업</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => {
              const typeInfo = TYPE_LABELS[expense.type];
              const statusInfo = STATUS_LABELS[expense.status];
              const canAdminDelete = ["SUBMITTED", "CANCELLED", "APPROVED"].includes(expense.status);
              return (
                <TableRow
                  key={expense.id}
                  className="cursor-pointer hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                  onClick={() => router.push(`/expenses/${expense.id}`)}
                  tabIndex={0}
                  aria-label={`${expense.title} 상세 보기`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/expenses/${expense.id}`);
                    }
                  }}
                >
                  <TableCell className="font-medium max-w-[200px] text-[var(--apple-label)]">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{expense.title}</span>
                      {expense.isUrgent && <span className="glass-badge glass-badge-red shrink-0">긴급</span>}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={typeInfo.className}>{typeInfo.label}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-[var(--apple-label)] pr-6">
                    {formatExpenseAmount(expense.amount, expense.currency, expense.amountOriginal)}
                  </TableCell>
                  <TableCell className="text-[var(--apple-secondary-label)]">
                    {getCategoryLabel(expense.category)}
                  </TableCell>
                  <TableCell>
                    <span className={statusInfo.className}>{statusInfo.label}</span>
                  </TableCell>
                  <TableCell className="text-[var(--apple-secondary-label)]">
                    {formatDateKR(expense.createdAt)}
                  </TableCell>
                  {showSubmitter && (
                    <TableCell className="text-[var(--apple-secondary-label)]">{expense.submitter?.name ?? "-"}</TableCell>
                  )}
                  {showSubmitter && (
                    <TableCell>
                      {expense.companyName && expense.companySlug ? (
                        <CompanyBadge name={expense.companyName} slug={expense.companySlug} />
                      ) : (
                        <span className="text-xs text-[var(--apple-tertiary-label)]">-</span>
                      )}
                    </TableCell>
                  )}
                  {isAdmin && (
                    <TableCell className="text-center w-[100px]">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickEdit(expense);
                          }}
                          className="px-2.5 py-1 text-xs font-medium rounded-full text-[var(--apple-orange)] hover:bg-[rgba(255,149,0,0.1)] transition-colors apple-press"
                        >
                          수정
                        </button>
                        {canAdminDelete && (
                          <button
                            onClick={(e) => handleAdminDelete(expense.id, e)}
                            disabled={deletingId === expense.id}
                            className={cn(
                              "px-2.5 py-1 text-xs font-medium rounded-full transition-colors apple-press",
                              confirmId === expense.id
                                ? "bg-[var(--apple-red)] text-white hover:bg-[color-mix(in_srgb,var(--apple-red)_85%,black)]"
                                : "text-[var(--apple-red)] hover:bg-[rgba(255,59,48,0.1)]"
                            )}
                            onBlur={() => setConfirmId(null)}
                          >
                            {deletingId === expense.id ? "..." : confirmId === expense.id ? "확인" : "삭제"}
                          </button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <SwipeableGroup>
        <div className="flex flex-col gap-3 lg:hidden">
          {expenses.map((expense) => (
            <MobileExpenseCard
              key={expense.id}
              expense={expense}
              showSubmitter={showSubmitter}
              isAdmin={isAdmin}
              onQuickEdit={handleQuickEdit}
            />
          ))}
        </div>
      </SwipeableGroup>

      {/* Admin quick edit dialog */}
      {isAdmin && (
        <AdminQuickEditDialog
          expense={editExpense}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Mobile Card using SwipeableRow
// ---------------------------------------------------------------------------

function MobileExpenseCard({
  expense,
  showSubmitter,
  isAdmin,
  onQuickEdit,
}: {
  expense: ExpenseRow;
  showSubmitter: boolean;
  isAdmin: boolean;
  onQuickEdit: (expense: ExpenseRow) => void;
}) {
  const router = useRouter();
  const typeInfo = TYPE_LABELS[expense.type];
  const statusInfo = STATUS_LABELS[expense.status];

  const canDelete = ["SUBMITTED", "CANCELLED", "APPROVED"].includes(expense.status);

  const actions: SwipeAction[] = useMemo(() => {
    const result: SwipeAction[] = [];

    if (isAdmin) {
      // Admin: swipe shows edit (quick popup) and delete
      result.push({
        key: "edit",
        icon: <Pencil className="size-5" strokeWidth={2} />,
        label: "수정",
        color: "var(--apple-orange)",
        activeColor: "color-mix(in srgb, var(--apple-orange) 85%, black)",
        onAction: () => onQuickEdit(expense),
      });
    } else {
      // Member: swipe shows edit (navigate to edit page)
      const canEdit = ["SUBMITTED", "APPROVED"].includes(expense.status);
      if (canEdit) {
        result.push({
          key: "edit",
          icon: <Pencil className="size-5" strokeWidth={2} />,
          label: "수정",
          color: "var(--apple-orange)",
          activeColor: "color-mix(in srgb, var(--apple-orange) 85%, black)",
          onAction: () => router.push(`/expenses/${expense.id}/edit`),
        });
      }
    }

    if (canDelete) {
      result.push({
        key: "delete",
        icon: <Trash2 className="size-5" strokeWidth={2} />,
        label: "삭제",
        color: "var(--apple-red)",
        activeColor: "color-mix(in srgb, var(--apple-red) 80%, black)",
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
  }, [expense, isAdmin, canDelete, router, onQuickEdit]);

  return (
    <SwipeableRow
      id={expense.id}
      actions={actions}
      onTap={() => router.push(`/expenses/${expense.id}`)}
      className="rounded-xl"
      enabled={actions.length > 0}
    >
      <div
        className="group relative flex flex-col gap-2 p-4 text-left rounded-xl bg-[var(--apple-system-background)] border border-[var(--glass-border)] shadow-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--apple-blue)] focus-visible:ring-offset-1 outline-none"
        aria-label={`${expense.title} 상세 보기`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium text-[var(--apple-label)] truncate">{expense.title}</span>
            {expense.isUrgent && <span className="glass-badge glass-badge-red shrink-0">긴급</span>}
          </span>
          <span className={cn(statusInfo.className, "shrink-0")}>{statusInfo.label}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={typeInfo.className}>{typeInfo.label}</span>
            <span className="text-xs text-[var(--apple-secondary-label)]">
              {getCategoryLabel(expense.category)}
            </span>
          </div>
          <span className="text-sm font-medium tabular-nums text-[var(--apple-label)]">
            {formatExpenseAmount(expense.amount, expense.currency, expense.amountOriginal)}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs text-[var(--apple-secondary-label)]">
          <span className="flex items-center gap-1.5">
            {expense.companyName && expense.companySlug && (
              <CompanyBadge name={expense.companyName} slug={expense.companySlug} />
            )}
            {formatDateKR(expense.createdAt)}
          </span>
          <div className="flex items-center gap-2">
            {/* Desktop action buttons */}
            {actions.length > 0 && (
              <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {actions.map((action) => (
                  <button
                    key={action.key}
                    onClick={(e) => { e.stopPropagation(); action.onAction(); }}
                    className="p-1 rounded-lg transition-colors hover:bg-[rgba(0,0,0,0.05)] dark:hover:bg-[rgba(255,255,255,0.08)]"
                    style={{ color: action.color }}
                    aria-label={action.label}
                  >
                    <span className="block size-3.5">{action.icon}</span>
                  </button>
                ))}
              </div>
            )}
            {showSubmitter && expense.submitter && (
              <span>{expense.submitter.name}</span>
            )}
          </div>
        </div>
      </div>
    </SwipeableRow>
  );
}
