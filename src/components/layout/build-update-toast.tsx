"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const STORAGE_KEY = "expenseone-build-hash";

export function BuildUpdateToast() {
  useEffect(() => {
    const currentHash = process.env.NEXT_PUBLIC_BUILD_HASH;
    if (!currentHash) return;

    try {
      const storedHash = localStorage.getItem(STORAGE_KEY);

      if (storedHash && storedHash !== currentHash) {
        // Version changed — show "updated" toast
        toast.success("새 버전으로 업데이트되었습니다", {
          description: "최신 기능이 적용되었어요.",
          duration: 4000,
        });
      }

      localStorage.setItem(STORAGE_KEY, currentHash);
    } catch {
      // localStorage unavailable
    }
  }, []);

  return null;
}
