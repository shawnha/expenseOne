"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ApproveRemainingButtonProps {
  expenseId: string;
  /** 확인 창에 띄울 잔금(원). 계산은 호출부가 lib/utils/pre-paid 로 한다. */
  remainingAmount: number;
  expenseTitle?: string;
  accountHolder?: string | null;
  className?: string;
}

/**
 * 후지급 승인 = "잔금을 보냈다"는 확정. 예전엔 누르는 즉시 승인됐는데, 상세 상단 배너의 큰 버튼이 되면서
 * 잘못 누르기 쉬워졌다 — 보낼 잔금과 예금주를 한 번 더 보여 주고 확인받는다.
 */
export function ApproveRemainingButton({
  expenseId,
  remainingAmount,
  expenseTitle,
  accountHolder,
  className,
}: ApproveRemainingButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleClick = async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/expenses/${expenseId}/approve-remaining`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message || "후지급 승인에 실패했습니다.");
      }

      toast.success("후지급이 승인되었습니다.");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "후지급 승인에 실패했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={isLoading}
        className={cn("rounded-full bg-[var(--apple-green)] hover:bg-[color-mix(in_srgb,var(--apple-green)_85%,black)] text-white text-sm font-medium", className)}
      >
        후지급 승인
      </Button>

      <Dialog open={open} onOpenChange={(v) => !isLoading && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>후지급 승인</DialogTitle>
            <DialogDescription>
              {expenseTitle ? <>&quot;{expenseTitle}&quot; 건의 잔금을 보냈으면 승인하세요.</> : "잔금을 보냈으면 승인하세요."}
              {" "}요청자에게 알림이 갑니다.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl glass-subtle px-4 py-3 text-[13px] text-[var(--apple-secondary-label)]">
            <div className="flex justify-between gap-3">
              <span>이번 지급액(잔금)</span>
              <span className="font-semibold tabular-nums text-[var(--apple-label)]">
                {remainingAmount.toLocaleString("ko-KR")}원
              </span>
            </div>
            {accountHolder && (
              <div className="mt-1 flex justify-between gap-3">
                <span>예금주</span>
                <span className="text-[var(--apple-label)]">{accountHolder}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isLoading} className="rounded-full">
              닫기
            </Button>
            <Button
              onClick={handleClick}
              disabled={isLoading}
              className="rounded-full bg-[var(--apple-green)] hover:bg-[color-mix(in_srgb,var(--apple-green)_85%,black)] text-white"
            >
              {isLoading && <Loader2 className="size-4 animate-spin" />}
              {isLoading ? "승인 중..." : "보냈습니다 · 승인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
