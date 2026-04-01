"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function SwUpdatePrompt() {
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);
  const pathname = usePathname();

  const checkForUpdate = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;

    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;

    // Already waiting → show toast
    if (reg.waiting) {
      setWaitingSW(reg.waiting);
      return;
    }

    // Trigger update check
    reg.update().catch(() => {});
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let intervalId: ReturnType<typeof setInterval>;

    async function setup() {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;

      // Check immediately
      if (reg.waiting) {
        setWaitingSW(reg.waiting);
      }

      // Listen for new SW
      const onUpdateFound = () => {
        const newSW = reg.installing;
        if (!newSW) return;

        newSW.addEventListener("statechange", () => {
          if (newSW.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingSW(newSW);
          }
        });
      };

      reg.addEventListener("updatefound", onUpdateFound);

      // Force check now
      reg.update().catch(() => {});

      // Periodic check every 30s
      intervalId = setInterval(() => {
        reg.update().catch(() => {});
      }, 30_000);

      return () => {
        reg.removeEventListener("updatefound", onUpdateFound);
      };
    }

    const cleanupPromise = setup();

    // Reload on controller change
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      clearInterval(intervalId);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, []);

  // Re-check on every page navigation
  useEffect(() => {
    checkForUpdate();
  }, [pathname, checkForUpdate]);

  if (!waitingSW) return null;

  return (
    <div className="fixed top-[calc(3.75rem+0.5rem)] left-4 right-4 z-[100] sm:left-auto sm:right-4 sm:w-80 animate-[fade-up_0.3s_ease]">
      <div className="flex items-center gap-3 p-3 rounded-2xl backdrop-blur-xl bg-white/90 dark:bg-[rgba(58,58,60,0.9)] shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-[var(--apple-separator)]">
        <div className="flex items-center justify-center size-9 rounded-xl bg-[var(--apple-blue)]/10 shrink-0">
          <RefreshCw className="size-4 text-[var(--apple-blue)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[var(--apple-label)]">
            새 버전이 있습니다
          </p>
          <p className="text-[11px] text-[var(--apple-secondary-label)]">
            업데이트하면 최신 기능을 사용할 수 있어요
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            waitingSW.postMessage("SKIP_WAITING");
            setTimeout(() => window.location.reload(), 2000);
          }}
          className="shrink-0 px-3 py-1.5 rounded-full bg-[var(--apple-blue)] text-white text-[12px] font-semibold apple-press transition-colors hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)]"
        >
          업데이트
        </button>
      </div>
    </div>
  );
}
