"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RotateCcw, Home } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DashboardError]", error);

    // ChunkLoadError = stale cache after deployment; hard reload to fix
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
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="flex items-center justify-center size-16 rounded-2xl bg-[#FF3B30]/10 mb-4">
        <AlertCircle className="size-8 text-[#FF3B30]" />
      </div>
      <h2 className="text-lg font-semibold text-[var(--apple-label)] mb-2">
        오류가 발생했습니다
      </h2>
      <p className="text-sm text-[var(--apple-secondary-label)] mb-6 max-w-sm">
        페이지를 불러오는 중 문제가 발생했습니다. 다시 시도해주세요.
      </p>
      <div className="flex gap-3">
        <Button
          onClick={() => reset()}
          className="rounded-full h-11 bg-[#007AFF] hover:bg-[#0066d6]"
        >
          <RotateCcw className="size-4 mr-1.5" />
          다시 시도
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            window.location.href = "/";
          }}
          className="rounded-full h-11 glass border-[var(--apple-separator)]"
        >
          <Home className="size-4 mr-1.5" />
          홈으로
        </Button>
      </div>
    </div>
  );
}
