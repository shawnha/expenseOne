"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Loader2 } from "lucide-react";
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
}

export function RevertApprovalButton({ expenseId, expenseTitle }: RevertApprovalButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reverting, setReverting] = useState(false);

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
