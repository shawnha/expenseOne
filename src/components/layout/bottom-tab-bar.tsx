"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Receipt,
  Plus,
  Bell,
  LayoutGrid,
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
    },
  ];
}

function isActivePath(pathname: string, href: string, allHrefs: string[]): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/admin") return pathname === "/admin";
  // Exact match
  if (pathname === href) return true;
  // Prefix match — but not if a more specific tab also matches
  if (pathname.startsWith(href + "/")) {
    const hasMoreSpecific = allHrefs.some(
      (other) => other !== href && other.startsWith(href + "/") && (pathname === other || pathname.startsWith(other + "/"))
    );
    return !hasMoreSpecific;
  }
  return false;
}

// ---------------------------------------------------------------------------
// BottomTabBar — iOS 26 Liquid Glass with Lens Effect
// ---------------------------------------------------------------------------

export function BottomTabBar({ userId, isAdmin, unreadCount }: BottomTabBarProps) {
  const pathname = usePathname();
  const { realtimeUnreadDelta, resetDelta, readAllTriggered } = useRealtimeNotifications(userId);
  const totalUnread = readAllTriggered ? realtimeUnreadDelta : unreadCount + realtimeUnreadDelta;

  const tabs = getTabItems(isAdmin, totalUnread);
  const allHrefs = tabs.map((t) => t.href);
  const isSubmitTab = (href: string) => href === "/expenses/new";

  return (
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
              onClick={() => {
                if (tab.badge) resetDelta();
              }}
              className={cn(
                "relative flex flex-col items-center justify-center gap-[2px] min-w-[56px] py-1 overflow-hidden",
                "transition-all duration-[400ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
                "apple-press"
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
  );
}
