"use client";

import { useEffect, useRef } from "react";

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

export function PushPrompt() {
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    // Guards
    if (!VAPID_PUBLIC_KEY) return;
    if (!("serviceWorker" in navigator)) return;
    if (!("PushManager" in window)) return;
    if (Notification.permission === "denied") return;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existingSub = await registration.pushManager.getSubscription();

        if (existingSub) {
          // Already subscribed — ensure server knows about it
          await sendSubscriptionToServer(existingSub);
          return;
        }

        // Request permission (shows browser prompt)
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Subscribe
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });

        await sendSubscriptionToServer(subscription);
      } catch (err) {
        console.error("[PushPrompt] Error subscribing to push:", err);
      }
    })();
  }, []);

  return null; // No visible UI — auto-prompts on mount
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
