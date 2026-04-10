"use client";

import React, { useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Receipt,
  LayoutDashboard,
  Clock,
  BarChart3,
  Users,
  Building2,
  Bell,
  Settings,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ExpenseOneLogo } from "@/components/layout/expense-one-logo";
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
  { label: "고위드 카드", href: "/admin/gowid", icon: <CreditCard className="size-[18px] [stroke-width:1.8]" /> },
];

const bottomNavItems: NavItem[] = [
  { label: "알림", href: "/notifications", icon: <Bell className="size-[18px] [stroke-width:1.8]" /> },
  { label: "설정", href: "/settings", icon: <Settings className="size-[18px] [stroke-width:1.8]" /> },
];

interface SidebarProps {
  user: User;
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
        "group relative flex items-center justify-center size-9 rounded-xl apple-press overflow-hidden",
        "transition-all duration-[350ms] ease-[cubic-bezier(0.25,1,0.5,1)]",
        isActive
          ? "text-[var(--apple-blue)]"
          : "text-[var(--apple-secondary-label)] hover:bg-[rgba(0,0,0,0.04)] dark:hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--apple-label)]"
      )}
    >
      {/* Glass Lens — magnifier pill behind active icon (matches tab bar) */}
      {isActive && (
        <div className="glass-lens absolute inset-0 rounded-xl" />
      )}
      <span
        ref={iconRef}
        className={cn(
          "relative z-[1] transition-colors duration-[350ms]",
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

