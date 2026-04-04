"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";

const COOLDOWN_KEY = "sw-update-ts";
const COOLDOWN_MS = 10_000;

function isInCooldown(): boolean {
  try {
    const ts = sessionStorage.getItem(COOLDOWN_KEY);
    if (!ts) return false;
    return Date.now() - parseInt(ts, 10) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function setCooldown() {
  try {
    sessionStorage.setItem(COOLDOWN_KEY, String(Date.now()));
  } catch {}
}

/** Reload the top-level window (handles splash-shell iframe context) */
function reloadTopWindow() {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.location.reload();
    } else {
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
}

export function SwUpdatePrompt() {
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  const pathname = usePathname();
  const foundRef = useRef(false);

  const markFound = useCallback((sw: ServiceWorker) => {
    if (foundRef.current) return;
    foundRef.current = true;
    setWaitingSW(sw);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let pollId: ReturnType<typeof setInterval>;
    let updateId: ReturnType<typeof setInterval>;

    async function setup() {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;

      const watchInstalling = (sw: ServiceWorker) => {
        sw.addEventListener("statechange", () => {
          if (sw.state === "installed" && navigator.serviceWorker.controller && !isInCooldown()) {
            markFound(sw);
          }
        });
      };

      // 1) Already waiting
      if (!isInCooldown() && reg.waiting) {
        markFound(reg.waiting);
      }

      // 2) Already installing (updatefound may have fired before React mount)
      if (!isInCooldown() && reg.installing) {
        watchInstalling(reg.installing);
      }

      // 3) Listen for future updatefound
      const onUpdateFound = () => {
        const newSW = reg.installing;
        if (newSW) watchInstalling(newSW);
      };
      reg.addEventListener("updatefound", onUpdateFound);

      // 4) Force update check now
      if (!isInCooldown()) {
        reg.update().catch(() => {});
      }

      // 5) Poll for reg.waiting every 3s as a fallback
      //    (catches edge cases where events are missed in iframe/PWA contexts)
      pollId = setInterval(async () => {
        if (foundRef.current || isInCooldown()) return;
        const r = await navigator.serviceWorker.getRegistration();
        if (r?.waiting) {
          markFound(r.waiting);
          clearInterval(pollId);
        }
      }, 3_000);

      // 6) Periodic update check every 30s
      updateId = setInterval(() => {
        if (!isInCooldown()) {
          reg.update().catch(() => {});
        }
      }, 30_000);

      return () => {
        reg.removeEventListener("updatefound", onUpdateFound);
      };
    }

    const cleanupPromise = setup();

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      reloadTopWindow();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      clearInterval(pollId);
      clearInterval(updateId);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, [markFound]);

  // Re-check on page navigation
  const checkForUpdate = useCallback(async () => {
    if (!("serviceWorker" in navigator) || isInCooldown() || foundRef.current) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    if (reg.waiting) {
      markFound(reg.waiting);
      return;
    }
    reg.update().catch(() => {});
  }, [markFound]);

  useEffect(() => {
    checkForUpdate();
  }, [pathname, checkForUpdate]);

  const handleUpdate = () => {
    if (!waitingSW) return;
    setUpdating(true);
    setCooldown();
    waitingSW.postMessage("SKIP_WAITING");
    // Fallback reload after 2s if controllerchange doesn't fire
    setTimeout(reloadTopWindow, 2000);
  };

  if (!waitingSW || updating) return null;

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
          onClick={handleUpdate}
          className="shrink-0 px-3 py-1.5 rounded-full bg-[var(--apple-blue)] text-white text-[12px] font-semibold apple-press transition-colors hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)]"
        >
          업데이트
        </button>
      </div>
    </div>
  );
}
