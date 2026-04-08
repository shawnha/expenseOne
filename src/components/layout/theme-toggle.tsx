"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark" | "system";

function getSystemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(mode: ThemeMode) {
  const isDark = mode === "dark" || (mode === "system" && getSystemDark());
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
  // NOTE: Do NOT mutate <meta name="theme-color"> here.
  // On iOS Safari in standalone PWA mode, changing theme-color
  // triggers a full page reload, which destroys the Supabase
  // auth session and redirects to login. The media-query-based
  // theme-color tags in layout.tsx handle this safely.
}

const CYCLE: ThemeMode[] = ["light", "dark", "system"];

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [mounted, setMounted] = useState(false);
  const [stretching, setStretching] = useState(false);

  // Listen for system theme changes when in "system" mode
  const handleSystemChange = useCallback(() => {
    const saved = localStorage.getItem("theme") as ThemeMode | null;
    if (!saved || saved === "system") {
      applyTheme("system");
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("theme") as ThemeMode | null;
    const initial = saved && CYCLE.includes(saved) ? saved : "system";
    setMode(initial);
    applyTheme(initial);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", handleSystemChange);
    return () => mq.removeEventListener("change", handleSystemChange);
  }, [handleSystemChange]);

  // Expose for settings page sync
  useEffect(() => {
    const handler = (e: CustomEvent<ThemeMode>) => {
      const next = e.detail;
      setMode(next);
      applyTheme(next);
      localStorage.setItem("theme", next);
    };
    window.addEventListener("theme-change" as string, handler as EventListener);
    return () => window.removeEventListener("theme-change" as string, handler as EventListener);
  }, []);

  const toggle = () => {
    setStretching(true);
    setTimeout(() => {
      // Always toggle based on CURRENT VISUAL STATE, not the mode value.
      // This avoids the bug where system(light) → light is a visual no-op.
      const currentlyDark = mode === "dark" || (mode === "system" && getSystemDark());
      const next: ThemeMode = currentlyDark ? "light" : "dark";

      setMode(next);
      applyTheme(next);
      localStorage.setItem("theme", next);

      // Notify settings page
      window.dispatchEvent(new CustomEvent("theme-change", { detail: next }));

      setTimeout(() => {
        setStretching(false);
      }, 150);
    }, 150);
  };

  if (!mounted) return null;

  const effectiveDark = mode === "dark" || (mode === "system" && getSystemDark());

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        mode === "light"
          ? "다크 모드로 전환"
          : mode === "dark"
            ? "시스템 테마로 전환"
            : "라이트 모드로 전환"
      }
      className={cn(
        "relative flex items-center w-[52px] h-[28px] rounded-full p-[2px] transition-colors duration-300",
        effectiveDark ? "bg-[#3A3A3C]" : "bg-[#E5E5EA]"
      )}
    >
      {/* Thumb with sticky stretch effect */}
      <span
        className="relative z-10 flex items-center justify-center h-[24px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
        style={{
          width: stretching ? 32 : 24,
          transform: effectiveDark
            ? stretching
              ? "translateX(16px)"
              : "translateX(24px)"
            : stretching
              ? "translateX(0px)"
              : "translateX(0px)",
          transition: stretching
            ? "width 150ms cubic-bezier(0.4, 0, 0.2, 1), transform 150ms cubic-bezier(0.4, 0, 0.2, 1)"
            : "width 200ms cubic-bezier(0.34, 1.56, 0.64, 1), transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {mode === "system" ? (
          /* Auto/System icon — circle with half fill */
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" stroke="#8E8E93" />
            <path d="M12 3a9 9 0 0 1 0 18z" fill="#8E8E93" />
          </svg>
        ) : mode === "dark" ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFD60A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF9500" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        )}
      </span>
    </button>
  );
}
