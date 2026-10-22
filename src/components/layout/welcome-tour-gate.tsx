"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";

const WelcomeTour = dynamic(() => import("@/components/onboarding/welcome-tour"), {
  ssr: false,
});

const KEY = "expenseone.tour.v1";

export function WelcomeTourGate({
  role,
  enabled,
}: {
  role: "MEMBER" | "ADMIN";
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) {
      // 안내를 띄우지 않는 화면(회사 선택 창 등)이면 기다리던 알림 허용 배너를 바로 풀어 준다.
      window.dispatchEvent(new Event("expenseone:tour-closed"));
      return;
    }
    try {
      // 마운트 뒤에만 알 수 있는 값(경로·저장소)이라 effect 안에서 연다.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.location.pathname === "/" && !localStorage.getItem(KEY)) setOpen(true);
    } catch {}
    const onOpen = () => setOpen(true);
    window.addEventListener("expenseone:open-tour", onOpen);
    return () => window.removeEventListener("expenseone:open-tour", onOpen);
  }, [enabled]);

  const onClose = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, "done");
    } catch {}
    window.dispatchEvent(new Event("expenseone:tour-closed"));
  }, []);

  if (!enabled || !open) return null;
  return <WelcomeTour role={role} open={open} onClose={onClose} />;
}
