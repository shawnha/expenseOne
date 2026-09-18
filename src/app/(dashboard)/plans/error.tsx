"use client";

import { Button } from "@/components/ui/button";

// 계획 화면만의 오류 경계. 여기서 막아야 조회 한 번 실패가 사이드바까지 날리지 않는다.
export default function PlansError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <p className="text-subheadline font-medium text-[var(--apple-red)]">
        비용계획을 불러오지 못했습니다
      </p>
      <p className="max-w-sm text-footnote text-[var(--apple-secondary-label)]">{error.message}</p>
      <Button type="button" size="lg" onClick={reset}>
        다시 시도
      </Button>
    </div>
  );
}
