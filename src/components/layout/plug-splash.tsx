"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface PlugSplashProps {
  mode: "connecting" | "disconnecting";
  onComplete?: () => void;
}

export function PlugSplash({ mode, onComplete }: PlugSplashProps) {
  const [phase, setPhase] = useState<"enter" | "active" | "exit">("enter");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("active"), 100);
    const duration = mode === "connecting" ? 1800 : 1200;
    const t2 = setTimeout(() => setPhase("exit"), duration);
    const t3 = setTimeout(() => onComplete?.(), duration + 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [mode, onComplete]);

  const isConnecting = mode === "connecting";

  return (
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[var(--apple-bg)]/80 backdrop-blur-xl transition-opacity duration-400",
        phase === "enter" ? "opacity-0" : phase === "exit" ? "opacity-0" : "opacity-100"
      )}
    >
      <div className="relative">
        <svg
          width="120"
          height="120"
          viewBox="0 0 24 24"
          fill="none"
          className={cn(
            "transition-colors duration-700",
            isConnecting
              ? "text-[#34C759] drop-shadow-[0_0_30px_rgba(52,199,89,0.4)]"
              : "text-[var(--apple-secondary-label)]"
          )}
        >
          {/* Socket (always fixed) */}
          <rect x="3" y="6" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <rect x="6.5" y="9.5" width="2" height="5" rx="0.5" fill="currentColor" opacity="0.3" />
          <rect x="10.5" y="9.5" width="2" height="5" rx="0.5" fill="currentColor" opacity="0.3" />

          {isConnecting ? (
            /* Plug slides in from right */
            <g className="splash-plug-slide-in">
              <rect x="6.5" y="9.5" width="2" height="5" rx="0.5" fill="currentColor" />
              <rect x="10.5" y="9.5" width="2" height="5" rx="0.5" fill="currentColor" />
              <rect x="15" y="8" width="4" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </g>
          ) : (
            /* Plug slides out to right */
            <g className="splash-plug-slide-out">
              <rect x="6.5" y="9.5" width="2" height="5" rx="0.5" fill="currentColor" />
              <rect x="10.5" y="9.5" width="2" height="5" rx="0.5" fill="currentColor" />
              <rect x="15" y="8" width="4" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
              <line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </g>
          )}

          {/* Connection spark (only on connect) */}
          {isConnecting && (
            <circle cx="9" cy="4" r="1.5" fill="currentColor" className="splash-spark" />
          )}
        </svg>

        {/* Glow ring on connect */}
        {isConnecting && (
          <div className="absolute inset-0 rounded-full splash-glow-ring" />
        )}
      </div>

      <p className={cn(
        "mt-6 text-sm font-medium tracking-wide transition-opacity duration-500",
        phase === "active" ? "opacity-100" : "opacity-0",
        isConnecting ? "text-[#34C759]" : "text-[var(--apple-secondary-label)]"
      )}>
        {isConnecting ? "연결 중..." : "연결 해제 중..."}
      </p>
    </div>
  );
}
