"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SwipeableGroup, SwipeableRow, type SwipeAction } from "@/components/ui/swipeable-row";
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
  autoClassified?: boolean;
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
  const [editExpense] = useState<ExpenseRow | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // ── Bulk approve state (admin only, deposit-request SUBMITTED only) ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  const approvable = useMemo(
    () => expenses.filter(
      (e) => e.type === "DEPOSIT_REQUEST" && e.status === "SUBMITTED",
    ),
    [expenses],
  );
  const approvableIds = useMemo(
    () => new Set(approvable.map((e) => e.id)),
    [approvable],
  );

  const allApprovableSelected =
    approvable.length > 0 && approvable.every((e) => selectedIds.has(e.id));

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (approvable.every((e) => prev.has(e.id))) {
        const next = new Set(prev);
        for (const e of approvable) next.delete(e.id);
        return next;
      }
      const next = new Set(prev);
      for (const e of approvable) next.add(e.id);
      return next;
    });
  }, [approvable]);

  const selectedCount = useMemo(
    () => expenses.filter((e) => selectedIds.has(e.id)).length,
    [expenses, selectedIds],
  );
  const selectedTotal = useMemo(
    () => expenses
      .filter((e) => selectedIds.has(e.id))
      .reduce((sum, e) => sum + (e.amount ?? 0), 0),
    [expenses, selectedIds],
  );

  const handleBulkApprove = useCallback(async () => {
    if (selectedCount === 0 || bulkApproving) return;
    if (!confirm(`${selectedCount}건 (${selectedTotal.toLocaleString()}원)을 일괄 승인하시겠습니까?`)) {
      return;
    }
    setBulkApproving(true);
    try {
      const res = await fetch("/api/expenses/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          expenseIds: Array.from(selectedIds),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? "승인 실패");
      }
      const { success, failed, errors } = json?.data ?? {};
      if (failed && failed > 0) {
        toast.warning(`${success}건 승인, ${failed}건 실패`);
        if (errors?.length) console.error("[bulk-approve errors]", errors);
      } else {
        toast.success(`${success}건 일괄 승인 완료`);
      }
      setSelectedIds(new Set());
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "승인 요청에 실패했습니다.");
    } finally {
      setBulkApproving(false);
    }
  }, [selectedIds, selectedCount, selectedTotal, bulkApproving, router]);

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
      {/* Bulk action toolbar — admin only, only shown when at least one
          deposit request is in SUBMITTED state on this page. Sticks to the
          top-left of the expense table area without taking over layout. */}
      {isAdmin && approvable.length > 0 && (
        <div className="hidden lg:flex items-center justify-between glass px-4 py-2.5 mb-3 rounded-xl">
          <label className="flex items-center gap-2 text-sm text-[var(--apple-label)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allApprovableSelected}
              onChange={toggleAll}
              className="size-4 accent-[var(--apple-blue)] cursor-pointer"
            />
            <span>
              승인 대기 입금요청 {approvable.length}건
              {selectedCount > 0 && (
                <span className="ml-2 text-[var(--apple-secondary-label)]">
                  · {selectedCount}건 선택 / {selectedTotal.toLocaleString()}원
                </span>
              )}
            </span>
          </label>
          <button
            type="button"
            onClick={handleBulkApprove}
            disabled={selectedCount === 0 || bulkApproving}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-semibold transition-colors apple-press",
              selectedCount === 0 || bulkApproving
                ? "bg-[var(--apple-fill)] text-[var(--apple-tertiary-label)] cursor-not-allowed"
                : "bg-[var(--apple-green)] text-white hover:bg-[color-mix(in_srgb,var(--apple-green)_85%,black)]",
            )}
          >
            {bulkApproving ? "승인 중..." : `선택 일괄 승인${selectedCount > 0 ? ` (${selectedCount})` : ""}`}
          </button>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden lg:block glass p-4 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {isAdmin && approvable.length > 0 && (
                <TableHead className="w-[40px] pl-2">
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={allApprovableSelected}
                    onChange={toggleAll}
                    className="size-4 accent-[var(--apple-blue)] cursor-pointer"
                  />
                </TableHead>
              )}
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
                  {isAdmin && approvable.length > 0 && (
                    <TableCell className="w-[40px] pl-2" onClick={(e) => e.stopPropagation()}>
                      {approvableIds.has(expense.id) ? (
                        <input
                          type="checkbox"
                          aria-label={`${expense.title} 선택`}
                          checked={selectedIds.has(expense.id)}
                          onChange={() => toggleOne(expense.id)}
                          className="size-4 accent-[var(--apple-blue)] cursor-pointer"
                        />
                      ) : (
                        <span className="inline-block size-4" aria-hidden="true" />
                      )}
                    </TableCell>
                  )}
                  <TableCell className="font-medium max-w-[200px] text-[var(--apple-label)]">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{expense.title}</span>
                      {expense.isUrgent && <span className="glass-badge glass-badge-red shrink-0">긴급</span>}
                      {expense.autoClassified && <span className="glass-badge glass-badge-blue shrink-0">자동분류</span>}
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
            {expense.autoClassified && <span className="glass-badge glass-badge-blue shrink-0">자동분류</span>}
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
