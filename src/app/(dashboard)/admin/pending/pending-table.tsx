"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  Paperclip,
  Loader2,
  CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatAmount } from "@/lib/validations/expense-form";
import { getCategoryLabel } from "@/lib/utils/expense-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PendingExpense {
  id: string;
  title: string;
  amount: number;
  category: string;
  createdAt: string;
  submitter: {
    name: string;
    email: string;
  } | null;
  attachmentCount: number;
  isUrgent: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PendingTableProps {
  expenses: PendingExpense[];
}

export function PendingTable({ expenses }: PendingTableProps) {
  const router = useRouter();

  // Single approve/reject
  const [approveTarget, setApproveTarget] = useState<PendingExpense | null>(null);
  const [approving, setApproving] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<PendingExpense | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"approve" | "reject" | null>(null);
  const [bulkRejectionReason, setBulkRejectionReason] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const allSelected = expenses.length > 0 && selectedIds.size === expenses.length;
  const someSelected = selectedIds.size > 0;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(expenses.map((e) => e.id)));
    }
  }, [allSelected, expenses]);

  // Single approve
  const handleApprove = async () => {
    if (!approveTarget) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/expenses/${approveTarget.id}/approve`, {
        method: "POST",
      });
      if (res.ok) {
        toast.success("승인되었습니다.");
        setApproveTarget(null);
        router.refresh();
      } else {
        const json = await res.json().catch(() => null);
        toast.error(json?.error?.message ?? "승인에 실패했습니다.");
      }
    } catch {
      toast.error("승인 요청 중 오류가 발생했습니다.");
    } finally {
      setApproving(false);
    }
  };

  // Single reject
  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectionReason.trim()) {
      toast.error("반려 사유를 입력해주세요.");
      return;
    }
    setRejecting(true);
    try {
      const res = await fetch(`/api/expenses/${rejectTarget.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      });
      if (res.ok) {
        toast.success("반려되었습니다.");
        setRejectTarget(null);
        setRejectionReason("");
        router.refresh();
      } else {
        const json = await res.json().catch(() => null);
        toast.error(json?.error?.message ?? "반려에 실패했습니다.");
      }
    } catch {
      toast.error("반려 요청 중 오류가 발생했습니다.");
    } finally {
      setRejecting(false);
    }
  };

  // Bulk action handler
  const handleBulkAction = async () => {
    if (bulkAction === "reject" && !bulkRejectionReason.trim()) {
      toast.error("반려 사유를 입력해주세요.");
      return;
    }
    setBulkProcessing(true);
    try {
      const res = await fetch("/api/expenses/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: bulkAction,
          expenseIds: Array.from(selectedIds),
          ...(bulkAction === "reject" ? { rejectionReason: bulkRejectionReason.trim() } : {}),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const { success, failed } = json.data;
        if (failed === 0) {
          toast.success(
            bulkAction === "approve"
              ? `${success}건 일괄 승인되었습니다.`
              : `${success}건 일괄 반려되었습니다.`,
          );
        } else {
          toast.warning(`${success}건 성공, ${failed}건 실패`);
        }
        setSelectedIds(new Set());
        setBulkAction(null);
        setBulkRejectionReason("");
        router.refresh();
      } else {
        const json = await res.json().catch(() => null);
        toast.error(json?.error?.message ?? "일괄 처리에 실패했습니다.");
      }
    } catch {
      toast.error("일괄 처리 요청 중 오류가 발생했습니다.");
    } finally {
      setBulkProcessing(false);
    }
  };

  if (expenses.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-[var(--apple-secondary-label)]">승인 대기 중인 요청이 없습니다</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="전체 선택"
                />
              </TableHead>
              <TableHead>제목</TableHead>
              <TableHead>제출자</TableHead>
              <TableHead className="text-right">금액</TableHead>
              <TableHead>카테고리</TableHead>
              <TableHead>제출일</TableHead>
              <TableHead className="text-center">첨부</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense, index) => (
              <TableRow
                key={expense.id}
                className={`hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)] cursor-pointer animate-row-enter stagger-${Math.min(index + 1, 8)} ${selectedIds.has(expense.id) ? "bg-[rgba(0,122,255,0.05)] dark:bg-[rgba(0,122,255,0.1)]" : ""}`}
                onClick={() => router.push(`/expenses/${expense.id}`)}
                tabIndex={0}
                role="link"
                aria-label={`${expense.title} 상세 보기`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/expenses/${expense.id}`);
                  }
                }}
              >
                <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(expense.id)}
                    onCheckedChange={() => toggleSelect(expense.id)}
                    aria-label={`${expense.title} 선택`}
                  />
                </TableCell>
                <TableCell className="max-w-[200px] text-sm font-medium text-[var(--apple-label)]">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{expense.title}</span>
                    {expense.isUrgent && <span className="glass-badge glass-badge-red shrink-0">긴급</span>}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-[var(--apple-label)]">{expense.submitter?.name ?? "알 수 없음"}</TableCell>
                <TableCell className="text-right text-sm tabular-nums font-medium text-[var(--apple-label)]">
                  {formatAmount(expense.amount)}원
                </TableCell>
                <TableCell>
                  <span className="text-xs text-[var(--apple-secondary-label)]">
                    {getCategoryLabel(expense.category)}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-[var(--apple-secondary-label)]">{formatDate(expense.createdAt)}</TableCell>
                <TableCell className="text-center">
                  {expense.attachmentCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-[var(--apple-secondary-label)]">
                      <Paperclip className="size-3" />
                      {expense.attachmentCount}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setApproveTarget(expense); }}
                      className="rounded-full bg-[var(--apple-green)] hover:bg-[color-mix(in_srgb,var(--apple-green)_85%,black)] text-white apple-press"
                    >
                      <Check className="size-3.5" />
                      승인
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(e) => { e.stopPropagation(); setRejectTarget(expense); }}
                      className="rounded-full apple-press"
                    >
                      <X className="size-3.5" />
                      반려
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {expenses.map((expense, index) => (
          <div
            key={expense.id}
            className={`rounded-xl bg-[var(--apple-system-background)] border border-[var(--glass-border)] shadow-sm overflow-hidden animate-card-enter stagger-${Math.min(index + 1, 8)} ${selectedIds.has(expense.id) ? "ring-2 ring-[var(--apple-blue)] ring-opacity-50" : ""}`}
          >
            <div className="flex items-start gap-3 p-4 pb-2">
              <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.has(expense.id)}
                  onCheckedChange={() => toggleSelect(expense.id)}
                  aria-label={`${expense.title} 선택`}
                />
              </div>
              <button
                type="button"
                onClick={() => router.push(`/expenses/${expense.id}`)}
                className="flex-1 min-w-0 text-left space-y-2 active:bg-[rgba(0,0,0,0.05)] dark:active:bg-[rgba(255,255,255,0.08)] transition-colors"
                aria-label={`${expense.title} 상세 보기`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--apple-label)] truncate flex items-center gap-1.5">
                      <span className="truncate">{expense.title}</span>
                      {expense.isUrgent && <span className="glass-badge glass-badge-red shrink-0">긴급</span>}
                    </p>
                    <p className="text-xs text-[var(--apple-secondary-label)]">{expense.submitter?.name ?? "알 수 없음"}</p>
                  </div>
                  <span className="text-xs text-[var(--apple-secondary-label)]">
                    {getCategoryLabel(expense.category)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-xs text-[var(--apple-secondary-label)]">
                    {formatDate(expense.createdAt)}
                    {expense.attachmentCount > 0 && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5">
                        <Paperclip className="size-2.5" />
                        {expense.attachmentCount}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-[var(--apple-label)]">
                    {formatAmount(expense.amount)}원
                  </span>
                </div>
              </button>
            </div>
            <div className="flex gap-2 px-4 pb-4 pt-2">
              <Button size="sm" className="flex-1 rounded-full bg-[var(--apple-green)] hover:bg-[color-mix(in_srgb,var(--apple-green)_85%,black)] text-white apple-press" onClick={() => setApproveTarget(expense)}>
                <Check className="size-3.5" />
                승인
              </Button>
              <Button size="sm" variant="destructive" className="flex-1 rounded-full apple-press" onClick={() => setRejectTarget(expense)}>
                <X className="size-3.5" />
                반려
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Floating bulk action bar */}
      {someSelected && (
        <div
          className="fixed left-0 right-0 z-50 flex items-center justify-center px-4 animate-in slide-in-from-bottom-4 fade-in duration-200"
          style={{ bottom: `calc(66px + env(safe-area-inset-bottom, 0px) + 12px)` }}
        >
          <div className="glass flex items-center gap-3 rounded-full px-5 py-3 shadow-lg border border-white/20 dark:border-white/10">
            <span className="text-sm font-medium text-[var(--apple-label)] whitespace-nowrap">
              <CheckCheck className="size-4 inline-block mr-1.5 -mt-0.5" />
              {selectedIds.size}건 선택됨
            </span>
            <div className="w-px h-5 bg-[var(--apple-separator)]" />
            <Button
              size="sm"
              onClick={() => {
                setBulkAction("approve");
              }}
              className="rounded-full bg-[var(--apple-green)] hover:bg-[color-mix(in_srgb,var(--apple-green)_85%,black)] text-white apple-press"
            >
              <Check className="size-3.5" />
              일괄 승인
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                setBulkAction("reject");
              }}
              className="rounded-full apple-press"
            >
              <X className="size-3.5" />
              일괄 반려
            </Button>
          </div>
        </div>
      )}

      {/* Single Approve Dialog */}
      <Dialog
        open={!!approveTarget}
        onOpenChange={(open) => { if (!open) setApproveTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>승인 확인</DialogTitle>
            <DialogDescription>
              &quot;{approveTarget?.title}&quot; 요청을 승인하시겠습니까?
              <br />
              금액: {formatAmount(approveTarget?.amount ?? 0)}원
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)} disabled={approving} className="rounded-full">
              취소
            </Button>
            <Button onClick={handleApprove} disabled={approving} className="rounded-full bg-[var(--apple-green)] hover:bg-[color-mix(in_srgb,var(--apple-green)_85%,black)]">
              {approving && <Loader2 className="size-4 animate-spin" />}
              승인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Reject Dialog */}
      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => {
          if (!open) { setRejectTarget(null); setRejectionReason(""); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>반려 사유 입력</DialogTitle>
            <DialogDescription>
              &quot;{rejectTarget?.title}&quot; 요청을 반려합니다.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="반려 사유를 입력하세요..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setRejectTarget(null); setRejectionReason(""); }}
              disabled={rejecting}
              className="rounded-full"
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejecting || !rejectionReason.trim()}
              className="rounded-full"
            >
              {rejecting && <Loader2 className="size-4 animate-spin" />}
              반려
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Approve Confirmation Dialog */}
      <Dialog
        open={bulkAction === "approve"}
        onOpenChange={(open) => { if (!open) setBulkAction(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>일괄 승인 확인</DialogTitle>
            <DialogDescription>
              선택한 {selectedIds.size}건의 요청을 모두 승인하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAction(null)} disabled={bulkProcessing} className="rounded-full">
              취소
            </Button>
            <Button
              onClick={handleBulkAction}
              disabled={bulkProcessing}
              className="rounded-full bg-[var(--apple-green)] hover:bg-[color-mix(in_srgb,var(--apple-green)_85%,black)]"
            >
              {bulkProcessing && <Loader2 className="size-4 animate-spin" />}
              {selectedIds.size}건 승인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Reject Dialog with reason */}
      <Dialog
        open={bulkAction === "reject"}
        onOpenChange={(open) => {
          if (!open) { setBulkAction(null); setBulkRejectionReason(""); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>일괄 반려 사유 입력</DialogTitle>
            <DialogDescription>
              선택한 {selectedIds.size}건의 요청을 반려합니다. 동일한 사유가 모든 건에 적용됩니다.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="반려 사유를 입력하세요..."
            value={bulkRejectionReason}
            onChange={(e) => setBulkRejectionReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setBulkAction(null); setBulkRejectionReason(""); }}
              disabled={bulkProcessing}
              className="rounded-full"
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkAction}
              disabled={bulkProcessing || !bulkRejectionReason.trim()}
              className="rounded-full"
            >
              {bulkProcessing && <Loader2 className="size-4 animate-spin" />}
              {selectedIds.size}건 반려
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
