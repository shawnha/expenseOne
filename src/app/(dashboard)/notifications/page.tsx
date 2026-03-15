"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCheck,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { NotificationType } from "@/types";

interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedExpenseId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

// Mock data
const MOCK_NOTIFICATIONS: NotificationItem[] = [
  { id: "n1", type: "DEPOSIT_APPROVED", title: "입금요청 승인", message: "사무용품 구매 입금요청이 승인되었습니다.", relatedExpenseId: "1", isRead: false, readAt: null, createdAt: "2026-03-13T09:00:00Z" },
  { id: "n2", type: "NEW_DEPOSIT_REQUEST", title: "새 입금요청", message: "김철수님이 외주 디자인 비용 입금요청을 제출했습니다.", relatedExpenseId: "2", isRead: false, readAt: null, createdAt: "2026-03-12T14:00:00Z" },
  { id: "n3", type: "DEPOSIT_REJECTED", title: "입금요청 반려", message: "서버 호스팅 비용 입금요청이 반려되었습니다.", relatedExpenseId: "4", isRead: true, readAt: "2026-03-11T10:00:00Z", createdAt: "2026-03-11T09:00:00Z" },
];

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

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data ?? []);
      } else {
        setNotifications(MOCK_NOTIFICATIONS);
      }
    } catch {
      setNotifications(MOCK_NOTIFICATIONS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleClick = async (notification: NotificationItem) => {
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
  };

  const handleMarkAllRead = async () => {
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
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">알림</h1>
          <p className="text-sm text-[var(--apple-secondary-label)] mt-0.5">비용 관련 알림을 확인하세요.</p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="rounded-xl glass border-[var(--apple-separator)] gap-1.5 apple-press"
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
        <h2 className="text-[15px] font-semibold text-[var(--apple-label)] mb-4">알림 목록</h2>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-[#007AFF]" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-[var(--apple-secondary-label)]">알림이 없습니다</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--apple-separator)]">
            {notifications.map((notification, index) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleClick(notification)}
                className={`flex w-full items-start gap-3 px-3 py-3.5 text-left transition-colors rounded-xl hover:bg-[rgba(0,0,0,0.03)] apple-press animate-row-enter stagger-${Math.min(index + 1, 8)} ${
                  !notification.isRead ? "bg-[rgba(0,122,255,0.04)]" : ""
                }`}
                aria-label={`${notification.title} - ${notification.isRead ? "읽음" : "읽지 않음"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm ${!notification.isRead ? "font-semibold text-[var(--apple-label)]" : "text-[var(--apple-label)]"}`}>
                      {notification.title}
                    </p>
                    {!notification.isRead && (
                      <span className="size-2 shrink-0 rounded-full bg-[#007AFF]" />
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] text-[var(--apple-secondary-label)] line-clamp-2">
                    {notification.message}
                  </p>
                  <p className="mt-1 text-[11px] text-[#c7c7cc]">
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
