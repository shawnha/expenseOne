"use client";

import React, { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  Home,
  Receipt,
  LayoutDashboard,
  Clock,
  BarChart3,
  Users,
  Building2,
  Bell,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ExpenseOneLogo } from "@/components/layout/expense-one-logo";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { User } from "@/types";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const mainNavItems: NavItem[] = [
  { label: "홈", href: "/", icon: <Home className="size-[18px]" /> },
  { label: "비용 관리", href: "/expenses", icon: <Receipt className="size-[18px]" /> },
];

const adminNavItems: NavItem[] = [
  { label: "대시보드", href: "/admin", icon: <LayoutDashboard className="size-[18px]" /> },
  { label: "전체 비용", href: "/admin/expenses", icon: <Receipt className="size-[18px]" /> },
  { label: "승인 대기", href: "/admin/pending", icon: <Clock className="size-[18px]" /> },
  { label: "리포트", href: "/admin/reports", icon: <BarChart3 className="size-[18px]" /> },
  { label: "사용자 관리", href: "/admin/users", icon: <Users className="size-[18px]" /> },
  { label: "부서 관리", href: "/admin/departments", icon: <Building2 className="size-[18px]" /> },
];

const bottomNavItems: NavItem[] = [
  { label: "알림", href: "/notifications", icon: <Bell className="size-[18px]" /> },
  { label: "설정", href: "/settings", icon: <Settings className="size-[18px]" /> },
];

interface SidebarProps {
  user: User;
}

function NavLink({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick?: () => void;
}) {
  const iconRef = useRef<HTMLSpanElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Trigger icon bounce animation
      const el = iconRef.current;
      if (el) {
        el.classList.remove("nav-icon-bounce");
        // Force reflow to restart animation
        void el.offsetWidth;
        el.classList.add("nav-icon-bounce");
      }
      onClick?.();
    },
    [onClick]
  );

  return (
    <Link
      href={item.href}
      prefetch={true}
      onClick={handleClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl apple-press",
        "transition-all duration-200",
        isActive
          ? "nav-link-active text-[var(--apple-blue)] font-medium"
          : "text-[var(--apple-secondary-label)] hover:bg-[rgba(0,0,0,0.04)] hover:text-[var(--apple-label)]"
      )}
    >
      <span
        ref={iconRef}
        className={cn(
          "transition-colors duration-200",
          isActive ? "text-[var(--apple-blue)]" : "text-[var(--apple-secondary-label)]"
        )}
      >
        {item.icon}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

function SidebarContent({
  user,
  onNavigate,
}: {
  user: User;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isAdmin = user.role === "ADMIN";
  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 items-center px-4 relative z-[2]">
        <ExpenseOneLogo size="md" />
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        {mainNavItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            isActive={isActive(item.href)}
            onClick={onNavigate}
          />
        ))}

        {isAdmin && (
          <div className="mt-5 flex flex-col gap-1">
            <span className="section-label mb-1 px-3">
              관리자
            </span>
            {adminNavItems.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                isActive={isActive(item.href)}
                onClick={onNavigate}
              />
            ))}
          </div>
        )}

        <div className="mt-auto" />

        <div className="mt-4 flex flex-col gap-1">
          {bottomNavItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={isActive(item.href)}
              onClick={onNavigate}
            />
          ))}
        </div>
      </nav>

    </div>
  );
}

export function Sidebar({ user }: SidebarProps) {
  return (
    <aside className="hidden h-screen w-60 shrink-0 overflow-hidden glass-sidebar lg:block">
      <SidebarContent user={user} />
    </aside>
  );
}

export function MobileSidebar({ user }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close sidebar whenever page changes (back gesture, link tap, etc.)
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus-visible:ring-0 border-0 shadow-none"
            aria-label="메뉴 열기"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-60 p-0 !bg-[var(--apple-system-background)] border-none" showCloseButton={false}>
        <SheetTitle className="sr-only">네비게이션 메뉴</SheetTitle>
        <SidebarContent user={user} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
