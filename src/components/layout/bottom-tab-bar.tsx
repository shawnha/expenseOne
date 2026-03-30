"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Receipt,
  Plus,
  Bell,
  LayoutGrid,
  LayoutDashboard,
  Clock,
  BarChart3,
  Users,
  Building2,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";

interface BottomTabBarProps {
  userId: string;
  isAdmin: boolean;
  unreadCount: number;
}

interface TabItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  isAction?: boolean;
  badge?: number;
  quickActions?: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
}

function getTabItems(isAdmin: boolean, badge: number): TabItem[] {
  return [
    { label: "홈", href: "/", icon: Home },
    { label: "비용", href: "/expenses", icon: Receipt },
    { label: "제출", href: "/expenses/new", icon: Plus, isAction: true },
    { label: "알림", href: "/notifications", icon: Bell, badge },
    {
      label: isAdmin ? "관리" : "설정",
      href: isAdmin ? "/admin" : "/settings",
      icon: LayoutGrid,
      quickActions: isAdmin
        ? [
            { label: "대시보드", href: "/admin", icon: LayoutDashboard },
            { label: "전체 비용", href: "/admin/expenses", icon: Receipt },
            { label: "승인 대기", href: "/admin/pending", icon: Clock },
            { label: "리포트", href: "/admin/reports", icon: BarChart3 },
            { label: "사용자 관리", href: "/admin/users", icon: Users },
            { label: "부서 관리", href: "/admin/departments", icon: Building2 },
            { label: "설정", href: "/settings", icon: Settings },
          ]
        : undefined,
    },
  ];
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

// ---------------------------------------------------------------------------
// Quick Actions Popover (iOS-style long-press menu)
// ---------------------------------------------------------------------------

function QuickActionsPopover({
  actions,
  anchorRef,
  onClose,
  onNavigate,
  pathname,
}: {
  actions: NonNullable<TabItem["quickActions"]>;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onNavigate: (href: string) => void;
  pathname: string;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleTap = (e: TouchEvent | MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("touchstart", handleTap, { passive: true });
    document.addEventListener("mousedown", handleTap);
    return () => {
      document.removeEventListener("touchstart", handleTap);
      document.removeEventListener("mousedown", handleTap);
    };
  }, [onClose, anchorRef]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-[2px] animate-[fade-in_0.15s_ease]"
        onClick={onClose}
      />
      {/* Popover */}
      <div
        ref={popoverRef}
        className={cn(
          "fixed z-[61] right-3 w-52",
          "rounded-2xl overflow-hidden",
          "bg-white/95 dark:bg-[#2c2c2e]/95 backdrop-blur-xl",
          "shadow-[0_8px_32px_rgba(0,0,0,0.18)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
          "border border-[var(--apple-separator)]",
          "animate-[scale-up_0.2s_cubic-bezier(0.34,1.56,0.64,1)]"
        )}
        style={{
          bottom: "calc(62px + env(safe-area-inset-bottom, 0px))",
          transformOrigin: "bottom right",
        }}
      >
        {actions.map((action, i) => {
          const Icon = action.icon;
          const active = isActivePath(pathname, action.href);
          return (
            <button
              key={action.href}
              type="button"
              onClick={() => {
                onNavigate(action.href);
                onClose();
              }}
              className={cn(
                "flex items-center gap-3 w-full px-4 py-2.5 text-left",
                "transition-colors duration-100",
                "active:bg-[var(--apple-fill)]",
                active
                  ? "text-[var(--apple-blue)]"
                  : "text-[var(--apple-label)]",
                i < actions.length - 1 &&
                  "border-b border-[var(--apple-separator)]"
              )}
            >
              <Icon
                className={cn(
                  "size-[18px]",
                  active
                    ? "text-[var(--apple-blue)]"
                    : "text-[var(--apple-secondary-label)]"
                )}
              />
              <span className="text-[14px] font-medium">{action.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// BottomTabBar
// ---------------------------------------------------------------------------

export function BottomTabBar({ userId, isAdmin, unreadCount }: BottomTabBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { realtimeUnreadDelta, resetDelta } = useRealtimeNotifications(userId);
  const totalUnread = unreadCount + realtimeUnreadDelta;
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const longPressTriggered = useRef(false);
  const adminTabRef = useRef<HTMLAnchorElement>(null);

  const tabs = getTabItems(isAdmin, totalUnread);

  const handleLongPressStart = useCallback(() => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      // Haptic feedback (Android only — iOS doesn't support navigator.vibrate)
      if (navigator.vibrate) navigator.vibrate(50);
      setQuickActionsOpen(true);
    }, 400);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    clearTimeout(longPressTimer.current);
  }, []);

  const handleLongPressCancel = useCallback(() => {
    clearTimeout(longPressTimer.current);
  }, []);

  return (
    <>
      {quickActionsOpen && (
        <QuickActionsPopover
          actions={tabs.find((t) => t.quickActions)?.quickActions ?? []}
          anchorRef={adminTabRef}
          onClose={() => setQuickActionsOpen(false)}
          onNavigate={(href) => router.push(href)}
          pathname={pathname}
        />
      )}
      <nav
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 lg:hidden",
          "glass-header border-t border-[var(--apple-separator)]",
          "pb-[env(safe-area-inset-bottom,0px)]",
          "select-none [-webkit-touch-callout:none]"
        )}
      >
        <div className="flex items-end justify-around h-[50px]">
          {tabs.map((tab) => {
            const active = isActivePath(pathname, tab.href);
            const Icon = tab.icon;

            if (tab.isAction) {
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "flex flex-col items-center justify-center -mt-3",
                    "apple-press"
                  )}
                  aria-label={tab.label}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center size-11 rounded-full",
                      "bg-[var(--apple-blue)] text-white",
                      "shadow-[0_2px_12px_rgba(0,122,255,0.4)]",
                      "transition-transform duration-200",
                      "active:scale-90"
                    )}
                  >
                    <Icon className="size-5 stroke-[2.5]" />
                  </div>
                  <span className="text-[11px] font-medium mt-0.5 text-[var(--apple-blue)]">
                    {tab.label}
                  </span>
                </Link>
              );
            }

            const hasQuickActions = !!tab.quickActions;

            return (
              <Link
                key={tab.href}
                ref={hasQuickActions ? adminTabRef : undefined}
                href={tab.href}
                prefetch={true}
                onClick={(e) => {
                  if (tab.badge) resetDelta();
                  if (hasQuickActions && longPressTriggered.current) {
                    e.preventDefault();
                    longPressTriggered.current = false;
                  }
                }}
                onTouchStart={hasQuickActions ? handleLongPressStart : undefined}
                onTouchEnd={hasQuickActions ? handleLongPressEnd : undefined}
                onTouchCancel={hasQuickActions ? handleLongPressCancel : undefined}
                onContextMenu={hasQuickActions ? (e) => e.preventDefault() : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 pt-1.5 min-w-[56px]",
                  "transition-colors duration-200",
                  "apple-press",
                  hasQuickActions && "[&]:[-webkit-touch-callout:none] [&]:[-webkit-user-select:none] select-none"
                )}
                aria-label={tab.label}
              >
                <div className="relative">
                  <Icon
                    className={cn(
                      "size-[22px] transition-colors duration-200",
                      active
                        ? "text-[var(--apple-blue)]"
                        : "text-[var(--apple-secondary-label)]"
                    )}
                  />
                  {tab.badge != null && tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-[var(--apple-red)] text-white text-[10px] font-bold px-1 shadow-[0_1px_4px_rgba(255,59,48,0.3)]">
                      {tab.badge > 99 ? "99+" : tab.badge}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[11px] font-medium transition-colors duration-200",
                    active
                      ? "text-[var(--apple-blue)]"
                      : "text-[var(--apple-secondary-label)]"
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
