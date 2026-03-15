"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();
  const [displayChildren, setDisplayChildren] = useState(children);
  const [phase, setPhase] = useState<"enter" | "idle">("enter");
  const prevPathname = useRef(pathname);

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname;
      setPhase("enter");
      setDisplayChildren(children);
    } else {
      setDisplayChildren(children);
    }
  }, [pathname, children]);

  useEffect(() => {
    if (phase === "enter") {
      const timer = setTimeout(() => setPhase("idle"), 500);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  return (
    <div
      className={
        phase === "enter"
          ? "animate-page-enter"
          : ""
      }
    >
      {displayChildren}
    </div>
  );
}
