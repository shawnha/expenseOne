"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const THRESHOLD = 80;
const MAX_PULL = 120;

export function PullToRefresh() {
  const router = useRouter();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const pullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const lockedRef = useRef(false); // true = vertical pull locked in, false/"horizontal" = cancelled

  const getScrollableParent = useCallback((): Element | null => {
    return document.querySelector("main.overflow-y-auto") ?? document.querySelector("main");
  }, []);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;
      const scrollEl = getScrollableParent();
      const scrollTop = scrollEl ? scrollEl.scrollTop : window.scrollY;
      if (scrollTop <= 0) {
        startYRef.current = e.touches[0].clientY;
        startXRef.current = e.touches[0].clientX;
        pullingRef.current = true;
        lockedRef.current = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || isRefreshingRef.current) return;
      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = currentY - startYRef.current;
      const deltaX = Math.abs(currentX - startXRef.current);

      // If horizontal movement exceeds vertical, this is a swipe — cancel pull
      if (!lockedRef.current && (deltaX > 10 || deltaY > 10)) {
        if (deltaX > deltaY) {
          pullingRef.current = false;
          pullDistanceRef.current = 0;
          setPullDistance(0);
          return;
        }
        lockedRef.current = true;
      }

      if (deltaY > 0) {
        const resistance = Math.min(deltaY * 0.5, MAX_PULL);
        pullDistanceRef.current = resistance;
        setPullDistance(resistance);
        if (resistance > 10) {
          e.preventDefault();
        }
      } else {
        pullingRef.current = false;
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    const onTouchEnd = () => {
      if (!pullingRef.current || isRefreshingRef.current) return;
      pullingRef.current = false;

      if (pullDistanceRef.current >= THRESHOLD) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);
        // Reset pull distance immediately — spinner stays via isRefreshing state
        pullDistanceRef.current = 0;
        setPullDistance(0);
        router.refresh();
        setTimeout(() => {
          isRefreshingRef.current = false;
          setIsRefreshing(false);
        }, 1200);
      } else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [router, getScrollableParent]);

  const progress = isRefreshing ? 1 : Math.min(pullDistance / THRESHOLD, 1);
  const isActive = pullDistance > 0 || isRefreshing;

  if (!isActive) return null;

  return (
    <div
      className="fixed left-0 right-0 z-50 flex items-center justify-center pointer-events-none"
      style={{
        top: isRefreshing ? 16 : Math.max(pullDistance - 40, 0),
        transition: pullingRef.current ? "none" : "top 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          opacity: progress,
          transform: `scale(${0.5 + progress * 0.5})`,
          transition: pullingRef.current ? "none" : "all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 28 28"
          fill="none"
          className={isRefreshing ? "animate-spin" : ""}
          style={
            !isRefreshing
              ? { transform: `rotate(${progress * 270}deg)`, transition: pullingRef.current ? "none" : "transform 0.3s ease" }
              : undefined
          }
        >
          <circle
            cx="14"
            cy="14"
            r="11"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
            className="text-[var(--apple-secondary-label)]"
            strokeDasharray={`${progress * 55} 69`}
          />
          {isRefreshing && (
            <circle
              cx="14"
              cy="14"
              r="11"
              stroke="#007AFF"
              strokeWidth="2.5"
              strokeLinecap="round"
              fill="none"
              strokeDasharray="17 52"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
