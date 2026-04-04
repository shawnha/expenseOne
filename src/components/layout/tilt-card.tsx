"use client";

import { useRef, type ReactNode } from "react";
import { useTiltEffect } from "@/hooks/use-tilt-effect";

interface TiltCardProps {
  children: ReactNode;
}

export function TiltCard({ children }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  useTiltEffect(ref);

  return <div ref={ref}>{children}</div>;
}
