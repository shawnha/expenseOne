"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Notification } from "@/types";
import { createClient } from "@/lib/supabase/client";

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (diff < minute) return "방금 전";
  if (diff < hour) return `${Math.floor(diff / minute)}분 전`;
  if (diff < day) return `${Math.floor(diff / hour)}시간 전`;
  if (diff < week) return `${Math.floor(diff / day)}일 전`;
  if (diff < month) return `${Math.floor(diff / week)}주 전`;
  return `${Math.floor(diff / month)}개월 전`;
}

interface NotificationListProps {
  initialNotifications: Notification[];
  userId: string;
}

export default function NotificationList({
  initialNotifications,
  userId,
}: NotificationListProps) {
  const router = useRouter();
  const [notifications, setNotifications] =
    useState<Notification[]>(initialNotifications);
  const [markingAll, setMarkingAll] = useState(false);

  // Realtime subscription for new notifications
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "expenseone",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const newNotification: Notification = {
            id: row.id as string,
            recipientId: row.recipient_id as string,
            type: row.type as Notification["type"],
            title: row.title as string,
            message: row.message as string,
            relatedExpenseId: (row.related_expense_id as string) ?? null,
            isRead: (row.is_read as boolean) ?? false,
            readAt: (row.read_at as string) ?? null,
            createdAt: row.created_at as string,
          };
          setNotifications((prev) => [newNotification, ...prev]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleClick = useCallback(
    async (notification: Notification) => {
      if (!notification.isRead) {
        try {
          await fetch(`/api/notifications/${notification.id}/read`, {
            method: "PATCH",
          });
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === notification.id
                ? { ...n, isRead: true, readAt: new Date().toISOString() }
                : n,
            ),
          );
        } catch {
          // Silently fail
        }
      }

      if (notification.relatedExpenseId) {
        router.push(`/expenses/${notification.relatedExpenseId}`);
      }
    },
    [router],
  );

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      const res = await fetch("/api/notifications/mark-all-read", {
        method: "PATCH",
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({
            ...n,
            isRead: true,
            readAt: n.readAt ?? new Date().toISOString(),
          })),
        );
        toast.success("모든 알림을 읽음 처리했습니다.");
      } else {
        setNotifications((prev) =>
          prev.map((n) => ({
            ...n,
            isRead: true,
            readAt: n.readAt ?? new Date().toISOString(),
          })),
        );
      }
    } catch {
      toast.error("요청 중 오류가 발생했습니다.");
    } finally {
      setMarkingAll(false);
    }
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">
            알림
          </h1>
          <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">
            비용 관련 알림을 확인하세요.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="rounded-full glass border-[var(--apple-separator)] gap-1.5 apple-press"
          >
            {markingAll ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCheck className="size-3.5" />
            )}
            전체 읽음
            <span className="glass-badge glass-badge-blue ml-0.5 animate-spring-pop">
              {unreadCount}
            </span>
          </Button>
        )}
      </div>

      {/* Notification List */}
      <div className="glass p-3 sm:p-4 lg:p-5 animate-fade-up-1">
        <h2 className="text-[15px] font-semibold text-[var(--apple-label)] mb-4">
          알림 목록
        </h2>

        {notifications.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-[var(--apple-secondary-label)]">
              알림이 없습니다
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--apple-separator)]">
            {notifications.map((notification, index) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleClick(notification)}
                className={`flex w-full items-start gap-3 px-3 py-3.5 text-left transition-colors rounded-xl hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)] apple-press animate-row-enter stagger-${Math.min(index + 1, 8)} ${
                  !notification.isRead ? "bg-[rgba(0,122,255,0.04)]" : ""
                }`}
                aria-label={`${notification.title} - ${notification.isRead ? "읽음" : "읽지 않음"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-sm ${!notification.isRead ? "font-semibold text-[var(--apple-label)]" : "text-[var(--apple-label)]"}`}
                    >
                      {notification.title}
                    </p>
                    {!notification.isRead && (
                      <span className="size-2 shrink-0 rounded-full bg-[var(--apple-blue)]" />
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] text-[var(--apple-secondary-label)] line-clamp-2">
                    {notification.message}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--apple-secondary-label)]">
                    {relativeTime(notification.createdAt)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
