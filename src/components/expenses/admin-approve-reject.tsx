"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { formatExpenseAmount } from "@/lib/utils/expense-utils";

interface AdminApproveRejectProps {
  expenseId: string;
  expenseTitle: string;
  expenseAmount: number;
  expenseCurrency?: string | null;
  expenseAmountOriginal?: number | null;
}

export function AdminApproveReject({ expenseId, expenseTitle, expenseAmount, expenseCurrency, expenseAmountOriginal }: AdminApproveRejectProps) {
  const router = useRouter();
  const [approveOpen, setApproveOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const handleApprove = async () => {
    setApproving(true);
    try {
      const res = await fetch(`/api/expenses/${expenseId}/approve`, { method: "POST" });
      if (res.ok) {
        toast.success("승인되었습니다.");
        setApproveOpen(false);
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

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error("반려 사유를 입력해주세요.");
      return;
    }
    setRejecting(true);
    try {
      const res = await fetch(`/api/expenses/${expenseId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      });
      if (res.ok) {
        toast.success("반려되었습니다.");
        setRejectOpen(false);
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

  return (
    <>
      <Button
        onClick={() => setApproveOpen(true)}
        className="rounded-full bg-[var(--apple-green)] hover:bg-[color-mix(in_srgb,var(--apple-green)_85%,black)] text-white apple-press"
      >
        <Check className="size-3.5" />
        승인
      </Button>
      <Button
        variant="destructive"
        onClick={() => setRejectOpen(true)}
        className="rounded-full apple-press"
      >
        <X className="size-3.5" />
        반려
      </Button>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>승인 확인</DialogTitle>
            <DialogDescription>
              &quot;{expenseTitle}&quot; 요청을 승인하시겠습니까?
              <br />
              금액: {formatExpenseAmount(expenseAmount, expenseCurrency, expenseAmountOriginal)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={approving} className="rounded-full">
              취소
            </Button>
            <Button onClick={handleApprove} disabled={approving} className="rounded-full bg-[var(--apple-green)] hover:bg-[color-mix(in_srgb,var(--apple-green)_85%,black)]">
              {approving && <Loader2 className="size-4 animate-spin" />}
              승인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={(open) => { if (!open) { setRejectOpen(false); setRejectionReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>반려 사유 입력</DialogTitle>
            <DialogDescription>
              &quot;{expenseTitle}&quot; 요청을 반려합니다.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="반려 사유를 입력하세요..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectOpen(false); setRejectionReason(""); }} disabled={rejecting} className="rounded-full">
              취소
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={rejecting || !rejectionReason.trim()} className="rounded-full">
              {rejecting && <Loader2 className="size-4 animate-spin" />}
              반려
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
