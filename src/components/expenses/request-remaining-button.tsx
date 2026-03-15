"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RequestRemainingButtonProps {
  expenseId: string;
}

export function RequestRemainingButton({ expenseId }: RequestRemainingButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/expenses/${expenseId}/request-remaining`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message || "후지급 요청에 실패했습니다.");
      }

      toast.success("후지급 요청이 완료되었습니다.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "후지급 요청에 실패했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleClick}
      disabled={isLoading}
      className="rounded-xl bg-[#007AFF] hover:bg-[#0066d6] text-white text-sm font-medium"
    >
      {isLoading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          요청 중...
        </>
      ) : (
        "후지급 요청"
      )}
    </Button>
  );
}
