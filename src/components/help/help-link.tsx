"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";

const STORAGE_KEY = "expenseone.help-usage.v1";
const DESKTOP = "(min-width: 1024px)";
const DAY = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" });
const pending = new Set<string>();

async function record(event: "view" | "click") {
  try {
    const day = DAY.format(new Date());
    const viewport = window.matchMedia(DESKTOP).matches ? "desktop" : "mobile";
    const previous = sessionStorage.getItem(STORAGE_KEY);
    const tabKey = previous?.startsWith(`${day}:`) ? previous.slice(day.length + 1) : crypto.randomUUID();
    sessionStorage.setItem(STORAGE_KEY, `${day}:${tabKey}`);
    const viewKey = `${STORAGE_KEY}.${viewport}.view`;
    const eventKey = event === "click" ? `${STORAGE_KEY}.${viewport}.click` : viewKey;
    if (sessionStorage.getItem(eventKey) === day || pending.has(eventKey)) return;

    pending.add(eventKey);
    try {
      const response = await fetch("/api/help/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabKey, viewport, event }),
        keepalive: true,
      });
      if (response.status === 204) {
        sessionStorage.setItem(eventKey, day);
        sessionStorage.setItem(viewKey, day);
      }
    } finally {
      pending.delete(eventKey);
    }
  } catch {
    // 사용법은 통계 저장 여부와 관계없이 열린다.
  }
}

export function HelpLink() {
  const link = useRef<HTMLAnchorElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const element = link.current;
    if (!element) return;
    let visible = false;
    const measure = () => {
      if (visible && document.visibilityState === "visible") void record("view");
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.intersectionRatio >= 0.75;
      measure();
    }, { threshold: 0.75 });
    const media = window.matchMedia(DESKTOP);
    observer.observe(element);
    document.addEventListener("visibilitychange", measure);
    media.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", measure);
      media.removeEventListener("change", measure);
    };
  }, [pathname]);

  return (
    <Link
      ref={link}
      href="/help"
      data-menu-tour="help"
      aria-label="사용법"
      title="사용법"
      onClick={() => void record("click")}
      onAuxClick={(event) => { if (event.button === 1) void record("click"); }}
      className="flex size-11 shrink-0 items-center justify-center rounded-xl transition-all duration-300 hover:bg-black/[0.04] active:scale-95 dark:hover:bg-white/[0.06]"
    >
      <CircleHelp className="size-[18px] text-[var(--apple-secondary-label)]" aria-hidden="true" />
    </Link>
  );
}
