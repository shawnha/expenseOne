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
  // Tracks how many notifications the user has individually marked as read
  // (separate from realtimeUnreadDelta so resetDelta doesn't undo read-marks)
  const [readOneDelta, setReadOneDelta] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onNewNotificationRef = useRef(onNewNotification);
  onNewNotificationRef.current = onNewNotification;

  // When mark-all-read fires, ignore the stale server-side unreadCount
  const [readAllTriggered, setReadAllTriggered] = useState(false);

  // Only clears the NEW notification delta — does not undo individual read-marks
  const resetDelta = useCallback(() => {
    setRealtimeUnreadDelta(0);
  }, []);

  // Listen for read events from notification list
  useEffect(() => {
    const handleReadAll = () => {
      setRealtimeUnreadDelta(0);
      setReadOneDelta(0);
      setReadAllTriggered(true);
    };
    const handleReadOne = () => {
      // Track individually-read notifications separately from the new-notification delta
      setReadOneDelta((prev) => prev + 1);
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

    const supabase = createClient();

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

  return { realtimeUnreadDelta, readOneDelta, resetDelta, readAllTriggered };
}
