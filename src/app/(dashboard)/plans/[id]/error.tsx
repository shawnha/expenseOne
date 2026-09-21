"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PlanDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <p className="text-subheadline font-medium text-[var(--apple-red)]">
        계획을 불러오지 못했습니다
      </p>
      <p className="max-w-sm text-footnote text-[var(--apple-secondary-label)]">{error.message}</p>
      <div className="flex items-center gap-2">
        <Link
          href="/plans"
          className="inline-flex h-11 items-center rounded-full border border-[var(--apple-separator)] px-4 text-sm font-medium text-[var(--apple-label)] transition-colors hover:bg-[var(--apple-tertiary-system-fill)]"
        >
          목록으로
        </Link>
        <Button type="button" size="lg" onClick={reset}>
          다시 시도
        </Button>
      </div>
    </div>
  );
}
