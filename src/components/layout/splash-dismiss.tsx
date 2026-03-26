"use client";

import { useEffect } from "react";

export function SplashDismiss() {
  useEffect(() => {
    if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).__splashDismiss) {
      (window as unknown as Record<string, () => void>).__splashDismiss();
    }
  }, []);

  return null;
}
