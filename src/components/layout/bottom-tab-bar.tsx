"use client";

import React, { useState, useRef, useCallback } from "react";
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
  badge?: number;
  quickActions?: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
}

function getTabItems(isAdmin: boolean, badge: number): TabItem[] {
  return [
    { label: "홈", href: "/", icon: Home },
    { label: "비용", href: "/expenses", icon: Receipt },
    { label: "제출", href: "/expenses/new", icon: Plus },
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

function isActivePath(pathname: string, href: string, allHrefs: string[]): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/admin") return pathname === "/admin";
  if (pathname === href) return true;
  if (pathname.startsWith(href + "/")) {
    const hasMoreSpecific = allHrefs.some(
      (other) => other !== href && other.startsWith(href + "/") && (pathname === other || pathname.startsWith(other + "/"))
    );
    return !hasMoreSpecific;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Quick Actions Popover (iOS-style long-press menu)
// ---------------------------------------------------------------------------

function QuickActionsPopover({
  actions,
  onClose,
  onNavigate,
  pathname,
}: {
  actions: NonNullable<TabItem["quickActions"]>;
  onClose: () => void;
  onNavigate: (href: string) => void;
  pathname: string;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

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
          "fixed z-[61] right-4 w-52",
          "rounded-2xl overflow-hidden",
          "bg-white/90 dark:bg-[#2c2c2e]/90",
          "backdrop-blur-xl",
          "shadow-[0_12px_48px_rgba(0,0,0,0.2)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.6)]",
          "border border-white/40 dark:border-white/10",
          "animate-[scale-up_0.2s_cubic-bezier(0.34,1.56,0.64,1)]"
        )}
        style={{
          bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
          transformOrigin: "bottom right",
        }}
      >
        {actions.map((action, i) => {
          const Icon = action.icon;
          const active = pathname === action.href || pathname.startsWith(action.href + "/");
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
                "active:bg-[var(--apple-fill,rgba(0,0,0,0.05))]",
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
// BottomTabBar — iOS 26 Liquid Glass with Lens Effect
// ---------------------------------------------------------------------------

export function BottomTabBar({ userId, isAdmin, unreadCount }: BottomTabBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { realtimeUnreadDelta, resetDelta, readAllTriggered } = useRealtimeNotifications(userId);
  const totalUnread = readAllTriggered ? realtimeUnreadDelta : unreadCount + realtimeUnreadDelta;
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const longPressTriggered = useRef(false);

  const tabs = getTabItems(isAdmin, totalUnread);
  const allHrefs = tabs.map((t) => t.href);
  const isSubmitTab = (href: string) => href === "/expenses/new";

  const handleLongPressStart = useCallback(() => {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
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
          onClose={() => setQuickActionsOpen(false)}
          onNavigate={(href) => router.push(href)}
          pathname={pathname}
        />
      )}

      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 lg:hidden",
          "flex justify-center",
          "pb-[max(8px,env(safe-area-inset-bottom,8px))]",
          "px-4",
          "select-none [-webkit-touch-callout:none]",
          "pointer-events-none"
        )}
      >
        <nav
          className={cn(
            "glass-tab-bar",
            "flex items-center justify-around",
            "w-full max-w-[420px]",
            "h-[64px] px-1",
            "pointer-events-auto"
          )}
        >
          {tabs.map((tab) => {
            const active = isActivePath(pathname, tab.href, allHrefs);
            const Icon = tab.icon;
            const isSubmit = isSubmitTab(tab.href);
            const hasQuickActions = !!tab.quickActions;

            if (isSubmit) {
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  prefetch={true}
                  className={cn(
                    "relative flex flex-col items-center justify-center min-w-[56px] py-1",
                    "transition-all duration-[400ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
                    "apple-press"
                  )}
                  aria-label={tab.label}
                >
                  <div
                    className={cn(
                      "flex items-center justify-center",
                      "size-[44px] rounded-full",
                      "bg-gradient-to-b from-[#4A9FFF] to-[var(--apple-blue)]",
                      "shadow-[0_4px_16px_rgba(0,122,255,0.35),0_2px_6px_rgba(0,122,255,0.2)]",
                      "transition-all duration-[400ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
                      active && "scale-[1.08] shadow-[0_4px_20px_rgba(0,122,255,0.45),0_2px_8px_rgba(0,122,255,0.3)]"
                    )}
                  >
                    <Plus className="size-[22px] text-white [stroke-width:2.5]" />
                  </div>
                </Link>
              );
            }

            return (
              <Link
                key={tab.href}
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
                  "relative flex flex-col items-center justify-center gap-[2px] min-w-[56px] py-1 overflow-hidden",
                  "transition-all duration-[400ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
                  "apple-press",
                  hasQuickActions && "[-webkit-touch-callout:none] [-webkit-user-select:none] select-none"
                )}
                aria-label={tab.label}
              >
                {/* Glass Lens — magnifier pill behind active tab */}
                {active && (
                  <div className="glass-lens absolute inset-x-1 inset-y-0" />
                )}

                <div className="relative z-[1]">
                  <Icon
                    className={cn(
                      "transition-all duration-[400ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
                      active
                        ? "size-[24px] text-[var(--apple-blue)]"
                        : "size-[22px] text-[var(--apple-secondary-label)]",
                      "[stroke-width:1.8]"
                    )}
                  />
                  {tab.badge != null && tab.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-[var(--apple-red)] text-white text-[11px] font-bold px-1 shadow-[0_2px_8px_rgba(255,59,48,0.35)]">
                      {tab.badge > 99 ? "99+" : tab.badge}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "relative z-[1] text-[10px] font-medium transition-all duration-[400ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
                    active
                      ? "text-[var(--apple-label)]"
                      : "text-[var(--apple-secondary-label)]"
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
