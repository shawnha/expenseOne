"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const THRESHOLD = 80;
const MAX_PULL = 120;
const HEADER_HEIGHT = 56; // h-14

export function PullToRefresh() {
  const router = useRouter();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const pullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const lockedRef = useRef(false);

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
        if (resistance > 10) e.preventDefault();
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

  const isPulling = pullDistance > 0 && !isRefreshing;
  const progress = isPulling ? Math.min(pullDistance / THRESHOLD, 1) : 1;

  if (!isPulling && !isRefreshing) return null;

  return (
    <>
      {/* During active pull — follows finger below header */}
      {isPulling && (
        <div
          className="fixed left-0 right-0 z-[45] flex justify-center pointer-events-none"
          style={{
            top: HEADER_HEIGHT + Math.min(pullDistance, THRESHOLD) - 36,
          }}
        >
          <div style={{ opacity: progress, transform: `scale(${0.5 + progress * 0.5})` }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none"
              style={{ transform: `rotate(${progress * 270}deg)` }}>
              <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" fill="none" className="text-[var(--apple-secondary-label)]"
                strokeDasharray={`${progress * 55} 69`} />
            </svg>
          </div>
        </div>
      )}

      {/* During refresh — fixed bar below header */}
      {isRefreshing && (
        <div
          className="fixed left-0 right-0 z-[45] flex justify-center pointer-events-none"
          style={{ top: HEADER_HEIGHT }}
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--apple-system-background)] shadow-sm border border-[var(--apple-separator)]"
            style={{ animation: "ptr-slide-in 0.25s ease-out" }}>
            <svg width="18" height="18" viewBox="0 0 28 28" fill="none" className="animate-spin">
              <circle cx="14" cy="14" r="11" stroke="#007AFF" strokeWidth="2.5"
                strokeLinecap="round" fill="none" strokeDasharray="17 52" />
            </svg>
            <span className="text-xs text-[var(--apple-secondary-label)]">업데이트 중</span>
          </div>
          <style dangerouslySetInnerHTML={{ __html: `@keyframes ptr-slide-in{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}` }} />
        </div>
      )}
    </>
  );
}
