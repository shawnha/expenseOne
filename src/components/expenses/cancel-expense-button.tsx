"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface CancelExpenseButtonProps {
  expenseId: string;
}

export function CancelExpenseButton({ expenseId }: CancelExpenseButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleCancel = () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/expenses/${expenseId}/cancel`, {
          method: "POST",
        });

        if (!res.ok) {
          const data = await res.json();
          toast.error(data.error?.message ?? "취소에 실패했습니다.");
          return;
        }

        toast.success("비용이 취소되었습니다.");
        router.refresh();
      } catch {
        toast.error("취소 중 오류가 발생했습니다.");
      }
    });
  };

  return (
    <button
      onClick={handleCancel}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-[#FF3B30] border border-[#FF3B30]/30 hover:bg-[#FF3B30]/10 transition-colors apple-press disabled:opacity-50"
    >
      {isPending ? "취소 중..." : "취소"}
    </button>
  );
}
