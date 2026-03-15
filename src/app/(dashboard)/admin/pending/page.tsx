"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
  Paperclip,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  formatAmount,
  CATEGORY_OPTIONS,
} from "@/lib/validations/expense-form";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingExpense {
  id: string;
  title: string;
  amount: number;
  category: string;
  createdAt: string;
  submitter: {
    name: string;
    email: string;
  };
  attachmentCount: number;
}

// Mock data
const MOCK_PENDING: PendingExpense[] = [
  { id: "m1", title: "외주 디자인 비용", amount: 800000, category: "SOFTWARE", createdAt: "2026-03-12T10:00:00Z", submitter: { name: "김철수", email: "kim@company.com" }, attachmentCount: 2 },
  { id: "m2", title: "서버 인프라 비용", amount: 350000, category: "EQUIPMENT", createdAt: "2026-03-11T14:00:00Z", submitter: { name: "이영희", email: "lee@company.com" }, attachmentCount: 1 },
  { id: "m3", title: "출장 교통비", amount: 120000, category: "TRAVEL", createdAt: "2026-03-10T09:00:00Z", submitter: { name: "박지민", email: "park@company.com" }, attachmentCount: 3 },
];

function getCategoryLabel(category: string): string {
  return CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? category;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminPendingPage() {
  const router = useRouter();
  const [expenses, setExpenses] = useState<PendingExpense[]>([]);
  const [loading, setLoading] = useState(true);

  const [approveTarget, setApproveTarget] = useState<PendingExpense | null>(null);
  const [approving, setApproving] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<PendingExpense | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        "/api/expenses?type=DEPOSIT_REQUEST&status=SUBMITTED&limit=100",
      );
      if (res.ok) {
        const json = await res.json();
        const items = (json.data ?? []).map((e: Record<string, unknown>) => ({
          id: e.id as string,
          title: e.title as string,
          amount: e.amount as number,
          category: e.category as string,
          createdAt: e.createdAt as string,
          submitter: e.submitter ?? { name: "알 수 없음", email: "" },
          attachmentCount:
            (e.attachmentCount as number) ??
            ((e.attachments as unknown[]) ?? []).length ??
            0,
        }));
        setExpenses(items);
      } else {
        setExpenses(MOCK_PENDING);
      }
    } catch {
      setExpenses(MOCK_PENDING);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

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
        fetchPending();
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
        fetchPending();
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

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">승인 대기</h1>
        <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">
          승인이 필요한 입금요청을 처리하세요.
        </p>
      </div>

      <div className="glass p-3 sm:p-4 lg:p-5 animate-fade-up-1">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[15px] font-semibold text-[var(--apple-label)]">대기 중인 요청</h2>
          {expenses.length > 0 && (
            <span className="glass-badge glass-badge-orange animate-spring-pop">{expenses.length}건</span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-[#007AFF]" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-[var(--apple-secondary-label)]">승인 대기 중인 요청이 없습니다</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
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
                      className={`hover:bg-[rgba(0,0,0,0.03)] cursor-pointer animate-row-enter stagger-${Math.min(index + 1, 8)}`}
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
                      <TableCell className="max-w-[200px] truncate text-sm font-medium text-[var(--apple-label)]">
                        {expense.title}
                      </TableCell>
                      <TableCell className="text-sm text-[var(--apple-label)]">{expense.submitter.name}</TableCell>
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
                            className="rounded-xl bg-[#34C759] hover:bg-[#2DB14F] text-white apple-press"
                          >
                            <Check className="size-3.5" />
                            승인
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={(e) => { e.stopPropagation(); setRejectTarget(expense); }}
                            className="rounded-xl apple-press"
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
            <div className="space-y-3 md:hidden">
              {expenses.map((expense, index) => (
                <div key={expense.id} className={`rounded-xl bg-[rgba(0,0,0,0.03)] overflow-hidden animate-card-enter stagger-${Math.min(index + 1, 8)}`}>
                  <button
                    type="button"
                    onClick={() => router.push(`/expenses/${expense.id}`)}
                    className="w-full p-4 pb-2 text-left space-y-2 active:bg-[rgba(0,0,0,0.05)] transition-colors"
                    aria-label={`${expense.title} 상세 보기`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--apple-label)] truncate">{expense.title}</p>
                        <p className="text-xs text-[var(--apple-secondary-label)]">{expense.submitter.name}</p>
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
                  <div className="flex gap-2 px-4 pb-4 pt-2">
                    <Button size="sm" className="flex-1 rounded-xl bg-[#34C759] hover:bg-[#2DB14F] text-white apple-press" onClick={() => setApproveTarget(expense)}>
                      <Check className="size-3.5" />
                      승인
                    </Button>
                    <Button size="sm" variant="destructive" className="flex-1 rounded-xl apple-press" onClick={() => setRejectTarget(expense)}>
                      <X className="size-3.5" />
                      반려
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Approve Dialog */}
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
            <Button variant="outline" onClick={() => setApproveTarget(null)} disabled={approving} className="rounded-xl">
              취소
            </Button>
            <Button onClick={handleApprove} disabled={approving} className="rounded-xl bg-[#34C759] hover:bg-[#2DB14F]">
              {approving && <Loader2 className="size-4 animate-spin" />}
              승인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
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
              className="rounded-xl"
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejecting || !rejectionReason.trim()}
              className="rounded-xl"
            >
              {rejecting && <Loader2 className="size-4 animate-spin" />}
              반려
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
