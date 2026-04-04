"use client";

import { useEffect, useRef } from "react";

const SPEED_FACTORS = [0.15, -0.1, 0.08, -0.12];

export function ParallaxOrbs() {
  const orbRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafId = useRef<number>(0);

  useEffect(() => {
    // Respect prefers-reduced-motion — keep orbs visible but skip parallax
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) return;

    const isMobile = window.innerWidth < 768;
    const mobileFactor = isMobile ? 0.5 : 1;

    function handleScroll() {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        orbRefs.current.forEach((orb, i) => {
          if (!orb) return;
          const offset = scrollY * SPEED_FACTORS[i] * mobileFactor;
          orb.style.transform = `translateY(${offset}px)`;
        });
      });
    }

    // Find the scrollable main element (the orbs' parent's scrollable ancestor)
    const scrollContainer = orbRefs.current[0]?.closest("main");

    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", () => {
        if (rafId.current) cancelAnimationFrame(rafId.current);
        rafId.current = requestAnimationFrame(() => {
          const scrollY = scrollContainer.scrollTop;
          orbRefs.current.forEach((orb, i) => {
            if (!orb) return;
            const offset = scrollY * SPEED_FACTORS[i] * mobileFactor;
            orb.style.transform = `translateY(${offset}px)`;
          });
        });
      }, { passive: true });
    } else {
      window.addEventListener("scroll", handleScroll, { passive: true });
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  return (
    <>
      <div
        ref={(el) => { orbRefs.current[0] = el; }}
        className="ambient-orb ambient-orb-blue"
        aria-hidden="true"
      />
      <div
        ref={(el) => { orbRefs.current[1] = el; }}
        className="ambient-orb ambient-orb-purple"
        aria-hidden="true"
      />
      <div
        ref={(el) => { orbRefs.current[2] = el; }}
        className="ambient-orb ambient-orb-teal"
        aria-hidden="true"
      />
      <div
        ref={(el) => { orbRefs.current[3] = el; }}
        className="ambient-orb ambient-orb-pink"
        aria-hidden="true"
      />
    </>
  );
}
