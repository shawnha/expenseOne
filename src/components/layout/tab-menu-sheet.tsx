"use client";

// 하단 탭 「메뉴」 시트 본문. bottom-tab-bar 가 열릴 때만 next/dynamic 으로 불러온다
// (탭 바는 모든 화면에 실려서 시트·아이콘 묶음을 거기 넣지 않는다).

import React from "react";
import {
  LayoutDashboard,
  Clock,
  BarChart3,
  Users,
  Building2,
  Settings,
  CreditCard,
  UserCheck,
  ShoppingBag,
  FileText,
  Repeat,
  ReceiptText,
  Receipt,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PlansNavGate, PlansNavIcon } from "@/components/plans/plans-nav-gate";
import { badgeCount, badgeText, type NavBadges } from "@/components/layout/use-nav-badges";
import { cn } from "@/lib/utils";
import { buildTabMenuItems, OPEN_TOUR_EVENT, type TabMenuIconKey } from "@/components/layout/tab-menu-items";

const ICONS: Record<TabMenuIconKey, React.ComponentType<{ className?: string }>> = {
  repeat: Repeat,
  plans: PlansNavIcon,
  "receipt-text": ReceiptText,
  "layout-dashboard": LayoutDashboard,
  receipt: Receipt,
  clock: Clock,
  "bar-chart": BarChart3,
  "user-check": UserCheck,
  "shopping-bag": ShoppingBag,
  "file-text": FileText,
  users: Users,
  building: Building2,
  "credit-card": CreditCard,
  settings: Settings,
};

export default function TabMenuSheet({
  open,
  onOpenChange,
  isAdmin,
  pathname,
  badges,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  pathname: string;
  badges: NavBadges;
  onNavigate: (href: string) => void;
}) {
  const items = buildTabMenuItems(isAdmin);
  const links = items.filter((item) => item.kind !== "tour");
  const tour = items.find((item) => item.kind === "tour");
  // 관리자는 메뉴가 14개라 한 줄 목록이면 화면을 넘친다 — 3열 타일로 한 화면에 다 보이게.
  const tileClass =
    "relative flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 py-2.5 text-center transition-colors duration-100 active:scale-[0.97] active:bg-[var(--apple-tertiary-system-fill)]";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[80dvh] gap-0 p-0 pb-[env(safe-area-inset-bottom,0px)]"
      >
        <SheetHeader className="px-5 pb-1 pt-4">
          <SheetTitle className="text-[13px] font-semibold text-[var(--apple-secondary-label)]">메뉴</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
          <div className="grid grid-cols-3 gap-1.5">
            {links.map((item) => {
              const Icon = ICONS[item.icon];
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const count = item.badgeKey ? badgeCount(badges[item.badgeKey]) : null;
              const tile = (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => {
                    onNavigate(item.href);
                    onOpenChange(false);
                  }}
                  className={cn(
                    tileClass,
                    active
                      ? "bg-[color-mix(in_srgb,var(--apple-blue)_12%,transparent)] text-[var(--apple-blue)]"
                      : "bg-[var(--apple-tertiary-system-fill)]/60 text-[var(--apple-label)]",
                  )}
                >
                  <Icon className={cn("size-[22px]", active ? "text-[var(--apple-blue)]" : "text-[var(--apple-secondary-label)]")} />
                  <span className="text-[12px] font-medium leading-tight break-keep">{item.label}</span>
                  {count != null && (
                    <span className="absolute right-2 top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--apple-red)] px-1 text-[11px] font-bold text-white tabular-nums">
                      {badgeText(count)}
                    </span>
                  )}
                </button>
              );
              return item.gated ? <PlansNavGate key={item.href}>{tile}</PlansNavGate> : tile;
            })}
          </div>
          {tour && (
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                // 안내 팝업(다른 브랜치)이 이 이벤트를 받아 연다. 받는 쪽이 없으면 아무 일도 없다.
                window.dispatchEvent(new Event(OPEN_TOUR_EVENT));
              }}
              className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-full text-[14px] font-medium text-[var(--apple-blue)] active:bg-[var(--apple-tertiary-system-fill)]"
            >
              {tour.label}
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
