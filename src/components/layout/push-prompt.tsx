"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribeToPush() {
  const registration = await navigator.serviceWorker.ready;
  const existingSub = await registration.pushManager.getSubscription();

  if (existingSub) {
    await sendSubscriptionToServer(existingSub);
    return true;
  }

  // Must be called from user gesture on iOS
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  });

  await sendSubscriptionToServer(subscription);
  return true;
}

const STORAGE_KEY = "push-prompt-dismissed";
const ALLOWED_PATHS = ["/"];

export function PushPrompt() {
  const [showBanner, setShowBanner] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const checked = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    if (!VAPID_PUBLIC_KEY) return;
    if (!("serviceWorker" in navigator)) return;
    if (!("PushManager" in window)) return;
    if (typeof Notification === "undefined") return;

    // Already granted — silently re-subscribe (ensure server has token)
    if (Notification.permission === "granted") {
      subscribeToPush().catch(() => {});
      return;
    }

    // Already denied — nothing we can do
    if (Notification.permission === "denied") return;

    // "default" — show banner (need user gesture for iOS)
    // Don't show if user dismissed before
    if (!localStorage.getItem(STORAGE_KEY)) {
      setShowBanner(true);
    }
  }, []);

  const handleEnable = useCallback(async () => {
    setSubscribing(true);
    try {
      const success = await subscribeToPush();
      if (success) {
        setShowBanner(false);
      }
    } catch (err) {
      console.error("[PushPrompt] Error:", err);
    } finally {
      setSubscribing(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    localStorage.setItem(STORAGE_KEY, "1");
  }, []);

  // Only show on allowed paths (home page), never on /notifications
  if (!showBanner) return null;
  if (!ALLOWED_PATHS.includes(pathname)) return null;

  return (
    <div className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] lg:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] max-lg:bottom-[calc(66px+env(safe-area-inset-bottom,0px)+0.75rem)] left-4 right-4 z-50 p-3 rounded-2xl backdrop-blur-xl bg-white/90 dark:bg-black/90 shadow-2xl border border-[var(--apple-separator)] flex items-center gap-3 animate-fade-up">
      <div className="flex items-center justify-center size-10 rounded-xl bg-[var(--apple-blue)]/10 shrink-0">
        <Bell className="size-5 text-[var(--apple-blue)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[var(--apple-label)]">알림을 켜시겠어요?</p>
        <p className="text-[11px] text-[var(--apple-secondary-label)]">승인/반려 결과를 바로 받아보세요</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleDismiss}
          className="text-[12px] text-[var(--apple-secondary-label)] px-3 py-2 min-h-[44px] flex items-center justify-center"
        >
          닫기
        </button>
        <button
          type="button"
          onClick={handleEnable}
          disabled={subscribing}
          className="text-[12px] font-semibold text-white bg-[var(--apple-blue)] px-4 py-2 min-h-[44px] rounded-full disabled:opacity-50 flex items-center justify-center"
        >
          {subscribing ? "..." : "허용"}
        </button>
      </div>
    </div>
  );
}

async function sendSubscriptionToServer(subscription: PushSubscription) {
  try {
    const sub = subscription.toJSON();
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys?.p256dh,
          auth: sub.keys?.auth,
        },
      }),
    });
  } catch (err) {
    console.error("[PushPrompt] Failed to save subscription:", err);
  }
}
