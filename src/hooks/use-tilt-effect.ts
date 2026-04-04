"use client";

import { useEffect, useRef, type RefObject } from "react";

interface TiltOptions {
  maxDeg?: number;
  disabled?: boolean;
}

export function useTiltEffect(
  ref: RefObject<HTMLElement | null>,
  options?: TiltOptions
) {
  const rafId = useRef<number>(0);
  const tiltX = useRef(0);
  const tiltY = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || options?.disabled) return;

    // Respect prefers-reduced-motion
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) return;

    // Only active on hover-capable devices (no touch)
    const hoverQuery = window.matchMedia("(hover: hover)");
    if (!hoverQuery.matches) return;

    const maxDeg = options?.maxDeg ?? 6;

    function handleMouseMove(e: MouseEvent) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Normalize to -1..1
      const normalX = (e.clientX - centerX) / (rect.width / 2);
      const normalY = (e.clientY - centerY) / (rect.height / 2);

      tiltX.current = normalX * maxDeg;
      tiltY.current = -normalY * maxDeg;

      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        if (!el) return;
        el.style.transition = "none";
        el.style.transform = `perspective(800px) rotateX(${tiltY.current}deg) rotateY(${tiltX.current}deg) translateY(-2px) scale(1.01)`;
      });
    }

    function handleMouseLeave() {
      if (!el) return;
      if (rafId.current) cancelAnimationFrame(rafId.current);
      el.style.transition = "transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
      el.style.transform = "";
    }

    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseleave", handleMouseLeave);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [ref, options?.disabled, options?.maxDeg]);
}
