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
export function useRealtimeNotifications(
  userId: string,
  onNewNotification?: () => void
) {
  const [realtimeUnreadDelta, setRealtimeUnreadDelta] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onNewNotificationRef = useRef(onNewNotification);
  onNewNotificationRef.current = onNewNotification;

  const resetDelta = useCallback(() => {
    setRealtimeUnreadDelta(0);
  }, []);

  useEffect(() => {
    if (!userId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on<RealtimeNotificationPayload>(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const notification = payload.new;

          // Increment the delta counter for unread badges
          setRealtimeUnreadDelta((prev) => prev + 1);

          // Show a toast with the notification title
          toast(notification.title, {
            description: notification.message,
          });

          // Call the optional callback (via ref to avoid resubscription)
          onNewNotificationRef.current?.();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId]);

  return { realtimeUnreadDelta, resetDelta };
}
