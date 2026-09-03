"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface RealtimeNotificationPayload {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  message: string;
  related_expense_id: string | null;
  is_read: boolean;
  created_at: string;
}

/**
 * Subscribe to realtime INSERT events on the `notifications` table
 * for a specific user. Increments unread count and shows a toast on
 * each new notification.
 */
// ---------------------------------------------------------------------------
// 사용자당 채널 하나를 공유한다.
//
// 같은 알림을 보는 컴포넌트가 여러 개여도(헤더 배지, 하단 탭 배지, 알림 목록)
// Supabase 구독은 하나면 충분하다. 구독자 수를 세어 마지막 하나가 빠질 때만
// 채널을 닫는다.
// ---------------------------------------------------------------------------
type Listener = (n: RealtimeNotificationPayload) => void;

const shared = new Map<
  string,
  { channel: RealtimeChannel; listeners: Set<Listener> }
>();

function subscribeToNotifications(userId: string, listener: Listener): () => void {
  let entry = shared.get(userId);

  if (!entry) {
    const supabase = createClient();
    const listeners = new Set<Listener>();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on<RealtimeNotificationPayload>(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "expenseone",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          // 스냅샷을 돌려서 콜백 안에서 구독 해제가 일어나도 안전하게 한다.
          for (const l of [...listeners]) l(payload.new);
        },
      )
      .subscribe();
    entry = { channel, listeners };
    shared.set(userId, entry);
  }

  entry.listeners.add(listener);

  return () => {
    const e = shared.get(userId);
    if (!e) return;
    e.listeners.delete(listener);
    if (e.listeners.size === 0) {
      createClient().removeChannel(e.channel);
      shared.delete(userId);
    }
  };
}

export function useRealtimeNotifications(
  userId: string,
  onNewNotification?: () => void
) {
  const [realtimeUnreadDelta, setRealtimeUnreadDelta] = useState(0);
  const onNewNotificationRef = useRef(onNewNotification);

  useEffect(() => {
    onNewNotificationRef.current = onNewNotification;
  }, [onNewNotification]);

  // When mark-all-read fires, ignore the stale server-side unreadCount
  const [readAllTriggered, setReadAllTriggered] = useState(false);

  const resetDelta = useCallback(() => {
    setRealtimeUnreadDelta(0);
  }, []);

  // Listen for read events from notification list
  useEffect(() => {
    const handleReadAll = () => {
      setRealtimeUnreadDelta(0);
      setReadAllTriggered(true);
    };
    const handleReadOne = () => {
      // If readAllTriggered, delta is already 0 so just keep it
      // If not, decrement the delta (but don't go below negative of server count)
      setRealtimeUnreadDelta((prev) => prev - 1);
    };
    window.addEventListener("notifications-read-all", handleReadAll);
    window.addEventListener("notification-read-one", handleReadOne);
    return () => {
      window.removeEventListener("notifications-read-all", handleReadAll);
      window.removeEventListener("notification-read-one", handleReadOne);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;

    // 이 훅은 헤더와 하단 탭에서 **동시에** 쓰인다(알림 배지가 두 곳에 있다).
    // 각자 채널을 열면 사용자 한 명당 WebSocket 구독이 2개씩 생기고, 그만큼
    // Realtime WAL 폴링이 늘어난다 — 이 인스턴스에서 가장 무거운 쿼리다.
    // 그래서 **구독은 한 번만** 만들고 콜백만 나눠 받는다.
    const unsubscribe = subscribeToNotifications(userId, (notification) => {
      setRealtimeUnreadDelta((prev) => prev + 1);
      toast(notification.title, { description: notification.message });
      onNewNotificationRef.current?.();
    });

    return unsubscribe;
  }, [userId]);

  return { realtimeUnreadDelta, resetDelta, readAllTriggered };
}
