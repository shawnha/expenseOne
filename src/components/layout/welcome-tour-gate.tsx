"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { loadPlansFlag } from "@/components/plans/plans-nav-gate";
import { getTourMode, type TourMode } from "@/components/onboarding/tour-steps";

const WelcomeTour = dynamic(() => import("@/components/onboarding/welcome-tour"), {
  ssr: false,
});

const KEY = "expenseone.tour.v1";
const V2_KEY = "expenseone.tour.v2";

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
  const [tour, setTour] = useState<{ mode: TourMode; plansEnabled: boolean } | null>(null);

  useEffect(() => {
    if (!enabled) {
      // 안내를 띄우지 않는 화면(회사 선택 창 등)이면 기다리던 알림 허용 배너를 바로 풀어 준다.
      window.dispatchEvent(new Event("expenseone:tour-closed"));
      return;
    }
    let alive = true;
    let request = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const open = async (mode: TourMode, automatic = false) => {
      const current = ++request;
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
    if (window.location.pathname === "/") {
      let mode: TourMode | null = null;
      try {
        mode = getTourMode(localStorage.getItem(KEY), localStorage.getItem(V2_KEY));
      } catch {}
      if (mode) void open(mode, true);
      else window.dispatchEvent(new Event("expenseone:tour-closed"));
    }
    const onOpen = () => { void open("full"); };
    window.addEventListener("expenseone:open-tour", onOpen);
    return () => {
      alive = false;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      window.removeEventListener("expenseone:open-tour", onOpen);
    };
  }, [enabled, plansEnabled]);

  const onClose = useCallback(() => {
    setTour(null);
    try {
      if (tour?.mode === "full") localStorage.setItem(KEY, "done");
      localStorage.setItem(V2_KEY, "done");
    } catch {}
    window.dispatchEvent(new Event("expenseone:tour-closed"));
  }, [tour]);

  if (!enabled || !tour) return null;
  return <WelcomeTour role={role} open onClose={onClose} plansEnabled={tour.plansEnabled} mode={tour.mode} />;
}
