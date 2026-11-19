"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HoldToConfirmButton } from "@/components/ui/hold-to-confirm-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";

interface CancelExpenseButtonProps {
  expenseId: string;
  expenseTitle: string;
  /** 승인 대기 중인 입금요청이면 true, 법카 사용(이미 승인)이면 false — 설명 문구가 다르다. */
  isDepositRequest: boolean;
}

/**
 * 비용 취소 — 되돌릴 수 없다(CANCELLED에서 나가는 길이 없다).
 * 예전엔 「취소」 한 번 누르면 바로 취소됐다. 앱의 다른 곳에서 「취소」는 '창 닫기'라
 * 수정·반품 등록 옆에서 잘못 누르기 쉬웠다(2026-11-19 디자인 검토 P0).
 * 그래서 이름은 「비용 취소」, 결과를 설명하는 창 + 길게 눌러 확정. 창을 닫는 버튼은 「닫기」.
 */
export function CancelExpenseButton({ expenseId, expenseTitle, isDepositRequest }: CancelExpenseButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleCancel = () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/expenses/${expenseId}/cancel`, {
          method: "POST",
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          toast.error(data?.error?.message ?? "비용 취소에 실패했습니다.");
          return;
        }

        toast.success("비용을 취소했습니다.");
        setOpen(false);
        router.refresh();
      } catch {
        toast.error("비용 취소 중 오류가 발생했습니다.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !isPending && setOpen(v)}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium text-[var(--apple-red)] border border-[var(--apple-red)]/30 hover:bg-[var(--apple-red)]/10 transition-colors apple-press"
          >
            비용 취소
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>이 비용을 취소할까요?</DialogTitle>
          <DialogDescription>
            &quot;{expenseTitle}&quot;{" "}
            {isDepositRequest
              ? "입금요청을 거둬들입니다. 관리자 승인 대기에서 빠지고, 다시 필요하면 새로 올려야 해요."
              : "법카 사용 기록을 취소합니다. 지출 합계에서 빠져요. 잘못 올렸거나 중복일 때만 쓰고, 환불을 받았다면 「반품 등록」을 쓰세요."}{" "}
            취소한 비용은 되돌릴 수 없어요.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={isPending} />}>닫기</DialogClose>
          <HoldToConfirmButton
            variant="destructive"
            onConfirm={handleCancel}
            disabled={isPending}
            fillClassName="bg-destructive/25"
          >
            {isPending ? "취소하는 중..." : "길게 눌러 비용 취소"}
          </HoldToConfirmButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
