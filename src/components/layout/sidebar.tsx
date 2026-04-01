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
  { label: "홈", href: "/", icon: <Home className="size-[18px] [stroke-width:1.8]" /> },
  { label: "비용 관리", href: "/expenses", icon: <Receipt className="size-[18px] [stroke-width:1.8]" /> },
];

const adminNavItems: NavItem[] = [
  { label: "대시보드", href: "/admin", icon: <LayoutDashboard className="size-[18px] [stroke-width:1.8]" /> },
  { label: "전체 비용", href: "/admin/expenses", icon: <Receipt className="size-[18px] [stroke-width:1.8]" /> },
  { label: "승인 대기", href: "/admin/pending", icon: <Clock className="size-[18px] [stroke-width:1.8]" /> },
  { label: "리포트", href: "/admin/reports", icon: <BarChart3 className="size-[18px] [stroke-width:1.8]" /> },
  { label: "사용자 관리", href: "/admin/users", icon: <Users className="size-[18px] [stroke-width:1.8]" /> },
  { label: "부서 관리", href: "/admin/departments", icon: <Building2 className="size-[18px] [stroke-width:1.8]" /> },
];

const bottomNavItems: NavItem[] = [
  { label: "알림", href: "/notifications", icon: <Bell className="size-[18px] [stroke-width:1.8]" /> },
  { label: "설정", href: "/settings", icon: <Settings className="size-[18px] [stroke-width:1.8]" /> },
];

interface SidebarProps {
  user: User;
}

/* ---- Full-width NavLink (used in mobile sheet sidebar) ---- */
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
      const el = iconRef.current;
      if (el) {
        el.classList.remove("nav-icon-bounce");
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
        "transition-all duration-[350ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
        isActive
          ? "text-[var(--apple-blue)] font-medium bg-[rgba(0,122,255,0.1)] dark:bg-[rgba(10,132,255,0.15)]"
          : "text-[var(--apple-secondary-label)] hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--apple-label)]"
      )}
    >
      <span
        ref={iconRef}
        className={cn(
          "transition-colors duration-[350ms]",
          isActive ? "text-[var(--apple-blue)]" : "text-[var(--apple-secondary-label)]"
        )}
      >
        {item.icon}
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

/* ---- Icon-only NavLink (used in desktop icon rail) ---- */
function RailNavLink({
  item,
  isActive,
}: {
  item: NavItem;
  isActive: boolean;
}) {
  const iconRef = useRef<HTMLSpanElement>(null);

  const handleClick = useCallback(() => {
    const el = iconRef.current;
    if (el) {
      el.classList.remove("nav-icon-bounce");
      void el.offsetWidth;
      el.classList.add("nav-icon-bounce");
    }
  }, []);

  return (
    <Link
      href={item.href}
      prefetch={true}
      onClick={handleClick}
      title={item.label}
      className={cn(
        "group relative flex items-center justify-center size-9 rounded-xl apple-press",
        "transition-all duration-[350ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
        isActive
          ? "text-[var(--apple-blue)] bg-[rgba(0,122,255,0.1)] dark:bg-[rgba(10,132,255,0.15)]"
          : "text-[var(--apple-secondary-label)] hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--apple-label)]"
      )}
    >
      <span
        ref={iconRef}
        className={cn(
          "transition-colors duration-[350ms]",
          isActive ? "text-[var(--apple-blue)]" : "text-[var(--apple-secondary-label)]"
        )}
      >
        {item.icon}
      </span>
      {/* Tooltip */}
      <span className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded-lg bg-[var(--apple-label)] text-[var(--apple-system-background)] text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
        {item.label}
      </span>
    </Link>
  );
}

/* ---- Mobile sheet sidebar content (full-width with labels) ---- */
function MobileSidebarContent({
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
      <div className="flex h-14 items-center px-4 relative z-[2]">
        <ExpenseOneLogo size="md" showIcon />
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2">
        {mainNavItems.map((item) => (
          <NavLink key={item.href} item={item} isActive={isActive(item.href)} onClick={onNavigate} />
        ))}
        {isAdmin && (
          <div className="mt-5 flex flex-col gap-1">
            <span className="section-label mb-1 px-3">관리자</span>
            {adminNavItems.map((item) => (
              <NavLink key={item.href} item={item} isActive={isActive(item.href)} onClick={onNavigate} />
            ))}
          </div>
        )}
        <div className="mt-auto" />
        <div className="mt-4 flex flex-col gap-1">
          {bottomNavItems.map((item) => (
            <NavLink key={item.href} item={item} isActive={isActive(item.href)} onClick={onNavigate} />
          ))}
        </div>
      </nav>
    </div>
  );
}

/* ---- Desktop icon rail content (56px, icons only with tooltips) ---- */
function RailContent({ user }: { user: User }) {
  const pathname = usePathname();
  const isAdmin = user.role === "ADMIN";
  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/admin") return pathname === "/admin";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="flex h-full flex-col items-center">
      {/* Logo (icon only) */}
      <div className="flex h-14 items-center justify-center relative z-[2]">
        <Link href="/" className="apple-press">
          <ExpenseOneLogo size="sm" showIcon className="[&>span:last-child]:hidden" />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto py-2 w-full px-2">
        {mainNavItems.map((item) => (
          <RailNavLink key={item.href} item={item} isActive={isActive(item.href)} />
        ))}

        {isAdmin && (
          <div className="mt-4 flex flex-col items-center gap-1.5 w-full">
            <div className="w-6 h-px bg-[var(--apple-separator)] opacity-50 mb-1" />
            {adminNavItems.map((item) => (
              <RailNavLink key={item.href} item={item} isActive={isActive(item.href)} />
            ))}
          </div>
        )}

        <div className="mt-auto" />

        <div className="mt-4 flex flex-col items-center gap-1.5 w-full">
          {bottomNavItems.map((item) => (
            <RailNavLink key={item.href} item={item} isActive={isActive(item.href)} />
          ))}
        </div>
      </nav>
    </div>
  );
}

export function Sidebar({ user }: SidebarProps) {
  return (
    <aside className="hidden h-screen w-14 shrink-0 overflow-visible glass-sidebar lg:block">
      <RailContent user={user} />
    </aside>
  );
}

export function MobileSidebar({ user }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
            className="lg:hidden focus-visible:ring-2 focus-visible:ring-[var(--apple-blue)] focus-visible:ring-offset-2 border-0 shadow-none"
            aria-label="메뉴 열기"
          />
        }
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-60 p-0 !bg-[var(--apple-system-background)] border-none" showCloseButton={false}>
        <SheetTitle className="sr-only">네비게이션 메뉴</SheetTitle>
        <MobileSidebarContent user={user} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
