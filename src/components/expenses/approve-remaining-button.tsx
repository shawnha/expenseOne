"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ApproveRemainingButtonProps {
  expenseId: string;
}

export function ApproveRemainingButton({ expenseId }: ApproveRemainingButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

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
    <Button
      onClick={handleClick}
      disabled={isLoading}
      className="rounded-xl bg-[#34C759] hover:bg-[#2db84e] text-white text-sm font-medium"
    >
      {isLoading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          승인 중...
        </>
      ) : (
        "후지급 승인"
      )}
    </Button>
  );
}
