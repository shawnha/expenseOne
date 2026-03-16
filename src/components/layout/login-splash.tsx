"use client";

import React, { useEffect, useState } from "react";
import { PlugSplash } from "@/components/layout/plug-splash";

export function LoginSplash() {
  // Start visible to prevent dashboard flash
  const [show, setShow] = useState(true);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Dismiss the PWA brand splash (root layout inline HTML)
    if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).__splashDismiss) {
      (window as unknown as Record<string, () => void>).__splashDismiss();
    }

    const key = "expense-one-splash-shown";
    if (sessionStorage.getItem(key)) {
      // Already shown this session — hide immediately
      setShow(false);
    } else {
      sessionStorage.setItem(key, "1");
    }
    setChecked(true);
  }, []);

  // Not yet checked sessionStorage — render a blank blocker to prevent flash
  if (!checked) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[var(--apple-bg)]" />
    );
  }

  if (!show) return null;

  return <PlugSplash mode="connecting" onComplete={() => setShow(false)} />;
}
