"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { createReloadGate, type ReloadGate } from "@/lib/form-busy";

const COOLDOWN_KEY = "sw-update-ts";
const COOLDOWN_MS = 10_000;
const PENDING_RELOAD_NOTICE = "업데이트가 준비됐습니다. 작성을 마치면 새로고침됩니다.";

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

/**
 * 게이트는 **모듈 스코프**에 둔다. 미뤄둔 새로고침이 이 컴포넌트 언마운트와 함께
 * 사라지면(예: 폼 작성 중 배포 → 미룸 → 로그아웃으로 /login 이동) controllerchange는
 * 다시 오지 않아 그 문서는 끝까지 옛 청크에 남는다 — 새 SW는 activate에서 옛 캐시를
 * 지우므로 그 청크는 404가 된다(스켈레톤에 갇힘).
 */
let sharedGate: ReloadGate | null = null;

function getReloadGate(): ReloadGate {
  if (!sharedGate) {
    sharedGate = createReloadGate({
      reload: reloadTopWindow,
      notifyPending: () => toast.info(PENDING_RELOAD_NOTICE, { id: "sw-update-pending" }),
    });
  }
  return sharedGate;
}

export function SwUpdatePrompt() {
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  const pathname = usePathname();
  const foundRef = useRef(false);
  /** 사용자가 "업데이트"를 직접 눌렀다 — 작성 중이어도 미루지 않는다(예전 동작). */
  const userRequestedRef = useRef(false);

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
      // 이벤트를 놓치는 경우(iframe/PWA)를 위한 폴백. **업데이트가 없으면
      // foundRef가 계속 false라 예전엔 이 3초 폴링이 영원히 돌았다.**
      // 놓친 이벤트는 초반에 잡히므로 1분(20회)만 보고 멈춘다 — 그 뒤는
      // 아래 30초 주기 update() 검사가 맡는다.
      let polls = 0;
      pollId = setInterval(async () => {
        if (foundRef.current || isInCooldown()) return;
        if (++polls > 20) {
          clearInterval(pollId);
          return;
        }
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

    // 새 SW가 페이지를 넘겨받으면(controllerchange) 새로고침한다.
    // 작성 중인 폼(useFormBusy)이 있으면 입력을 날리지 않게 미룬다 —
    // 폼이 끝나면(다른 화면 이동·입력 비움) 또는 안전 상한(30분 무입력)이 지나면 그때 새로고침.
    // 작성 중인 폼이 없거나 사용자가 직접 "업데이트"를 눌렀으면 예전처럼 곧바로.
    const onControllerChange = () => getReloadGate().request(userRequestedRef.current);
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      clearInterval(pollId);
      clearInterval(updateId);
      // 게이트는 dispose하지 않는다 — 미뤄둔 새로고침은 언마운트 뒤에도 살아 있어야 한다.
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
    userRequestedRef.current = true;
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
