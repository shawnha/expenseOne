"use client";

import { useEffect } from "react";
import { ExpenseOneLogo } from "@/components/layout/expense-one-logo";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RootError]", error);

    // ChunkLoadError from stale SW cache after deployment — hard reload
    if (
      error.message?.includes("ChunkLoadError") ||
      error.message?.includes("Loading chunk") ||
      error.message?.includes("Failed to fetch dynamically imported module") ||
      error.message?.includes("Importing a module script failed")
    ) {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister());
        });
      }
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--apple-system-background,#f2f2f7)] px-4 text-center">
      {/* Branding */}
      <div className="mb-6">
        <ExpenseOneLogo size="lg" showIcon />
      </div>

      {/* Glass card */}
      <div className="glass w-full max-w-sm rounded-2xl border border-[var(--apple-separator,rgba(0,0,0,0.1))] p-8">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-[var(--apple-red,#FF3B30)]/10">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--apple-red, #FF3B30)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="mb-2 text-lg font-semibold text-[var(--apple-label,#1c1c1e)]">
          문제가 발생했습니다
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-[var(--apple-secondary-label,#8e8e93)]">
          일시적인 오류가 발생했습니다. 다시 시도해주세요.
        </p>
        {error.digest && (
          <p className="mb-4 break-all text-[10px] text-[var(--apple-tertiary-label,#c7c7cc)] opacity-50">
            {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--apple-blue,#007AFF)] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[color-mix(in_srgb,var(--apple-blue,#007AFF)_85%,black)]"
          >
            다시 시도
          </button>
          <a
            href="/"
            className="glass inline-flex h-11 items-center justify-center rounded-full border border-[var(--apple-separator,rgba(0,0,0,0.1))] px-6 text-[15px] font-medium text-[var(--apple-label,#1c1c1e)] transition-colors"
          >
            홈으로 돌아가기
          </a>
        </div>
      </div>
    </div>
  );
}
