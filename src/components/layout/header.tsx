"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MobileSidebar } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";
import { LogoutPlug } from "@/components/layout/logout-plug";
import { PlugSplash } from "@/components/layout/plug-splash";
import type { User } from "@/types";

interface HeaderProps {
  user: User;
  title?: string;
  unreadCount?: number;
}

export function Header({ user, title, unreadCount = 0 }: HeaderProps) {
  const router = useRouter();
  const supabase = createClient();
  const { realtimeUnreadDelta, resetDelta } = useRealtimeNotifications(user.id);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const totalUnread = unreadCount + realtimeUnreadDelta;
  const initial = user.name ? user.name.charAt(0) : "U";

  const handleSignOut = () => {
    setIsLoggingOut(true);
    // PlugSplash onComplete will handle the actual sign-out
  };

  const completeSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <>
    {/* Full-screen plug disconnect splash */}
    {isLoggingOut && (
      <PlugSplash mode="disconnecting" onComplete={completeSignOut} />
    )}
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 sm:gap-4 glass-header px-3 sm:px-4 lg:px-6 overflow-hidden max-w-full">
      {/* Mobile menu button */}
      <MobileSidebar user={user} />

      {/* Page title */}
      {title && (
        <h1 className="text-sm font-medium text-[var(--apple-label)]">{title}</h1>
      )}

      {/* Right section */}
      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
        {/* Notifications */}
        <Link
          href="/notifications"
          onClick={() => resetDelta()}
          className={cn(
            "relative flex items-center justify-center size-9 sm:size-11 rounded-xl",
            "transition-all duration-300 [transition-timing-function:cubic-bezier(0.25,0.1,0.25,1)]",
            "hover:bg-[rgba(0,0,0,0.04)]",
            "active:scale-95"
          )}
          aria-label="알림"
        >
          <Bell className="size-[18px] text-[var(--apple-secondary-label)]" />
          {totalUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[var(--apple-red)] text-white text-[10px] font-semibold px-1 shadow-[0_2px_6px_rgba(255,59,48,0.3)] animate-[scale-in_0.3s_cubic-bezier(0.34,1.56,0.64,1)]">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </Link>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* Login status indicator — hidden on mobile to save space */}
        <div className="hidden sm:block">
          <LogoutPlug connected={!isLoggingOut} />
        </div>

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-all duration-200 hover:bg-[rgba(0,0,0,0.04)] active:scale-[0.98] focus-visible:outline-none"
                aria-label="사용자 메뉴"
              >
                <div className="flex size-7 items-center justify-center rounded-full bg-[rgba(0,122,255,0.1)] text-[var(--apple-blue)] text-xs font-semibold">
                  {initial}
                </div>
                <span className="hidden sm:inline text-sm font-medium text-[var(--apple-label)]">
                  {user.name}
                </span>
              </button>
            }
          />
          <DropdownMenuContent align="end" sideOffset={8} className="w-52 glass-strong p-1">
            <div className="px-2.5 py-2">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-[var(--apple-secondary-label)]">
                {user.email}
              </p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/settings")}
            >
              <span>설정</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={handleSignOut}
            >
              <span>로그아웃</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    </>
  );
}
