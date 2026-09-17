"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface RevertApprovalButtonProps {
  expenseId: string;
  expenseTitle: string;
  /** 선지급 건 여부 — 승인 취소 시 후지급 상태 초기화 경고에 사용 */
  isPrePaid?: boolean;
  remainingPaymentRequested?: boolean;
  remainingPaymentApproved?: boolean;
}

export function RevertApprovalButton({
  expenseId,
  expenseTitle,
  isPrePaid = false,
  remainingPaymentRequested = false,
  remainingPaymentApproved = false,
}: RevertApprovalButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reverting, setReverting] = useState(false);

  // 승인 취소는 후지급 요청·승인 플래그를 false로 되돌린다(revertApproval).
  // 이미 선지급·후지급을 송금한 건이면 재승인 후 같은 금액을 또 보내기 쉬우므로 따로 강조한다.
  const hasPrePaidState = isPrePaid || remainingPaymentRequested || remainingPaymentApproved;

  const handleRevert = async () => {
    setReverting(true);
    try {
      const res = await fetch(`/api/expenses/${expenseId}/revert-approval`, { method: "POST" });
      if (res.ok) {
        toast.success("승인이 취소되었습니다. 승인 대기 상태로 변경되었습니다.");
        setOpen(false);
        router.refresh();
      } else {
        const json = await res.json().catch(() => null);
        toast.error(json?.error?.message ?? "승인 취소에 실패했습니다.");
      }
    } catch {
      toast.error("승인 취소 요청 중 오류가 발생했습니다.");
    } finally {
      setReverting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="rounded-full glass border-[var(--apple-separator)] text-[var(--apple-orange)] apple-press"
      >
        <RotateCcw className="size-3.5" />
        승인 취소
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>승인 취소 확인</DialogTitle>
            <DialogDescription>
              &quot;{expenseTitle}&quot; 요청의 승인을 취소하고 승인 대기 상태로 되돌립니다.
              <br />
              요청자에게 알림이 발송됩니다.
            </DialogDescription>
          </DialogHeader>
          {/* 승인 취소 → 수정 → 재승인 경로의 부작용 안내.
              재승인은 승인 알림·Slack·푸시를 처음부터 다시 보낸다 */}
          <div className="space-y-2">
            <p className="text-[13px] text-[var(--apple-secondary-label)]">
              승인을 취소하면 요청이 승인 대기로 돌아가고, 다시 승인할 때 승인 알림이 요청자와 Slack에 다시 나갑니다.
            </p>
            {hasPrePaidState && (
              <div
                role="alert"
                className="flex gap-2.5 rounded-xl border border-[rgba(255,149,0,0.2)] bg-[rgba(255,149,0,0.1)] dark:bg-[rgba(255,159,10,0.14)] p-4"
              >
                <TriangleAlert className="size-4 shrink-0 mt-0.5 text-[var(--apple-orange)]" aria-hidden />
                <p className="text-[13px] font-medium text-[var(--apple-label)]">
                  이 요청은 선지급 건입니다. 승인을 취소하면 후지급 요청·승인 상태도 초기화됩니다. 이미 송금한 금액이 있다면 중복 송금에 주의하세요.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={reverting} className="rounded-full">
              닫기
            </Button>
            <Button onClick={handleRevert} disabled={reverting} className="rounded-full bg-[var(--apple-orange)] hover:bg-[color-mix(in_srgb,var(--apple-orange)_85%,black)] text-white">
              {reverting && <Loader2 className="size-4 animate-spin" />}
              승인 취소
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
