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
  /** If true, renders as the center "action" button */
  isAction?: boolean;
  /** Show unread badge */
  badge?: number;
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
    },
  ];
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function BottomTabBar({ userId, isAdmin, unreadCount }: BottomTabBarProps) {
  const pathname = usePathname();
  const { realtimeUnreadDelta, resetDelta } = useRealtimeNotifications(userId);
  const totalUnread = unreadCount + realtimeUnreadDelta;

  const tabs = getTabItems(isAdmin, totalUnread);

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 lg:hidden",
        "glass-header border-t border-[var(--apple-separator)]",
        "pb-[env(safe-area-inset-bottom,0px)]"
      )}
    >
      <div className="flex items-end justify-around h-[50px]">
        {tabs.map((tab) => {
          const active = isActive(pathname, tab.href);
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
                <span className="text-[10px] font-medium mt-0.5 text-[var(--apple-blue)]">
                  {tab.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={true}
              onClick={tab.badge ? resetDelta : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 pt-1.5 min-w-[56px]",
                "transition-colors duration-200",
                "apple-press"
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
                  <span className="absolute -top-1.5 -right-2 flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-[var(--apple-red)] text-white text-[9px] font-bold px-1 shadow-[0_1px_4px_rgba(255,59,48,0.3)]">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors duration-200",
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
  );
}
