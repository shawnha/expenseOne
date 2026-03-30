"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [stretching, setStretching] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
      setDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggle = () => {
    setStretching(true);
    // Stretch phase — thumb elongates
    setTimeout(() => {
      const next = !dark;
      setDark(next);
      if (next) {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
      } else {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
      }
      // Update PWA status bar color
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", next ? "#000000" : "#F2F2F7");
      // Release phase — thumb snaps to new position
      setTimeout(() => {
        setStretching(false);
      }, 150);
    }, 150);
  };

  if (!mounted) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className={cn(
        "relative flex items-center w-[52px] h-[28px] rounded-full p-[2px] transition-colors duration-300",
        dark ? "bg-[#3A3A3C]" : "bg-[#E5E5EA]"
      )}
    >
      {/* Thumb with sticky stretch effect */}
      <span
        className="relative z-10 flex items-center justify-center h-[24px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.15)]"
        style={{
          width: stretching ? 32 : 24,
          transform: dark
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
        {dark ? (
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
