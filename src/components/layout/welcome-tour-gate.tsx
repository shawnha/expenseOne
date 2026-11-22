"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { OPEN_MENU_TOUR_EVENT, OPEN_TOUR_EVENT } from "./tab-menu-items";
import { loadPlansFlag } from "@/components/plans/plans-nav-gate";
import { getTourMode, type TourMode } from "@/components/onboarding/tour-steps";

const WelcomeTour = dynamic(() => import("@/components/onboarding/welcome-tour"), {
  ssr: false,
});

const MenuTour = dynamic(() => import("@/components/onboarding/menu-tour"), { ssr: false });

const KEY = "expenseone.tour.v1";
const V2_KEY = "expenseone.tour.v2";
/** v3 = 「내 카드 등록」 장·관리자 고위드 안내(2026-11-18). */
const V3_KEY = "expenseone.tour.v3";

export function WelcomeTourGate({
  role,
  enabled,
  plansEnabled,
}: {
  role: "MEMBER" | "ADMIN";
  enabled: boolean;
  /** 이미 읽은 스위치가 있으면 재사용한다. 없으면 메뉴와 같은 요청을 최대 1초 기다린다. */
  plansEnabled?: boolean;
}) {
  const pathname = usePathname();
  const [tour, setTour] = useState<{ mode: TourMode | "menu"; plansEnabled: boolean } | null>(null);
  const offeredOnHome = useRef(false);

  useEffect(() => {
    if (!enabled) {
      // 안내를 띄우지 않는 화면(회사 선택 창 등)이면 기다리던 알림 허용 배너를 바로 풀어 준다.
      window.dispatchEvent(new Event("expenseone:tour-closed"));
      return;
    }
    let alive = true;
    let request = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const open = async (mode: TourMode | "menu", automatic = false) => {
      const current = ++request;
      if (mode === "menu") {
        setTour((shown) => shown ?? { mode: "menu", plansEnabled: false });
        return;
      }
      // 호출마다 자기 타이머를 정리한다. 메뉴 재열기가 자동 열기의 타이머를 덮지 않는다.
      let timer: ReturnType<typeof setTimeout> | undefined;
      let allowed = plansEnabled ?? false;
      try {
        allowed = plansEnabled ?? await Promise.race([
          loadPlansFlag(),
          new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), 1000);
            timers.add(timer);
          }),
        ]);
      } catch {
        // flag 실패 시 계획 단계만 뺀다.
      } finally {
        clearTimeout(timer);
        if (timer) timers.delete(timer);
      }
      // 열린 뒤 늦게 도착한 flag로 단계 수를 바꾸지 않는다. 자동 열기는 여전히 홈일 때만.
      if (alive && current === request && (!automatic || window.location.pathname === "/")) {
        setTour((shown) => shown ?? { mode, plansEnabled: allowed });
      }
    };
    if (pathname === "/" && !offeredOnHome.current) {
      let mode: TourMode | null = null;
      try {
        mode = getTourMode(localStorage.getItem(KEY), localStorage.getItem(V2_KEY), localStorage.getItem(V3_KEY));
      } catch {}
      if (mode) {
        void open(mode === "full" ? "menu" : mode, true);
      } else {
        offeredOnHome.current = true;
        window.dispatchEvent(new Event("expenseone:tour-closed"));
      }
    }
    const onOpen = () => { void open("full"); };
    const onOpenMenu = () => { void open("menu"); };
    window.addEventListener(OPEN_TOUR_EVENT, onOpen);
    window.addEventListener(OPEN_MENU_TOUR_EVENT, onOpenMenu);
    return () => {
      alive = false;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      window.removeEventListener(OPEN_TOUR_EVENT, onOpen);
      window.removeEventListener(OPEN_MENU_TOUR_EVENT, onOpenMenu);
    };
  }, [enabled, pathname, plansEnabled]);

  const onClose = useCallback(() => {
    setTour(null);
    offeredOnHome.current = true;
    try {
      if (tour?.mode === "full" || tour?.mode === "menu") localStorage.setItem(KEY, "done");
      localStorage.setItem(V2_KEY, "done");
      localStorage.setItem(V3_KEY, "done");
    } catch {}
    window.dispatchEvent(new Event("expenseone:tour-closed"));
  }, [tour]);

  if (!enabled || !tour) return null;
  if (tour.mode === "menu") return <MenuTour onClose={onClose} />;
  return <WelcomeTour role={role} open onClose={onClose} plansEnabled={tour.plansEnabled} mode={tour.mode} />;
}
