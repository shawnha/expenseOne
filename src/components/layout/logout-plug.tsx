"use client";

import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface LogoutPlugProps {
  connected: boolean;
  className?: string;
}

export function LogoutPlug({ connected, className }: LogoutPlugProps) {
  const [animating, setAnimating] = useState(false);

  const handleMouseEnter = useCallback(() => {
    if (!connected || animating) return;
    setAnimating(true);
  }, [connected, animating]);

  const handleAnimationEnd = useCallback(() => {
    setAnimating(false);
  }, []);

  // Logging out
  if (!connected) {
    return (
      <div
        aria-label="로그아웃 중..."
        className={cn("relative flex items-center justify-center size-8 rounded-xl", className)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          className="relative text-[var(--apple-secondary-label)]"
        >
          {/* Socket (fixed) */}
          <rect x="2" y="6" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
          <rect x="4.5" y="9.5" width="2" height="5" rx="0.5" fill="currentColor" opacity="0.2" />
          <rect x="7.5" y="9.5" width="2" height="5" rx="0.5" fill="currentColor" opacity="0.2" />
          {/* Plug (slides out) */}
          <g className="animate-plug-out">
            <rect x="16" y="8" width="4" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
            <line x1="16" y1="10.5" x2="14" y2="10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="16" y1="13.5" x2="14" y2="13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="20" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </g>
        </svg>
      </div>
    );
  }

  return (
    <div
      aria-label="로그인 상태"
      title="로그인 상태"
      className={cn("relative flex items-center justify-center size-8 rounded-xl cursor-default", className)}
      onMouseEnter={handleMouseEnter}
    >
      {animating && (
        <span className="absolute inset-0 rounded-xl bg-[rgba(52,199,89,0.08)] animate-pulse" />
      )}
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        className={cn(
          "relative text-[var(--apple-green)] transition-all duration-300",
          animating && "drop-shadow-[0_0_6px_rgba(52,199,89,0.5)]"
        )}
      >
        {/* Socket (always fixed) */}
        <rect x="3" y="6" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" fill="none" />
        <rect x="6.5" y="9.5" width="2" height="5" rx="0.5" fill="currentColor" opacity="0.3" />
        <rect x="10.5" y="9.5" width="2" height="5" rx="0.5" fill="currentColor" opacity="0.3" />

        {/* Plug part (prongs + body + cord) - this moves */}
        <g
          className={animating ? "animate-plug-in" : undefined}
          onAnimationEnd={handleAnimationEnd}
        >
          {/* Prongs (inserted into socket) */}
          <rect x="6.5" y="9.5" width="2" height="5" rx="0.5" fill="currentColor" />
          <rect x="10.5" y="9.5" width="2" height="5" rx="0.5" fill="currentColor" />
          {/* Plug body */}
          <rect x="15" y="8" width="4" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" fill="none" />
          {/* Cord */}
          <line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </g>

        {/* Connection indicator */}
        <circle cx="9" cy="4" r="1.5" fill="currentColor" className={animating ? "animate-pulse" : undefined} />
      </svg>
    </div>
  );
}
