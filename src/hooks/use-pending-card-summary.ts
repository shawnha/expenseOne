"use client";

import { useEffect, useState } from "react";
import type { PendingCardSummary } from "@/services/card-batch.service";

export function usePendingCardSummary() {
  const [summary, setSummary] = useState<PendingCardSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch("/api/card-transactions/pending/summary", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) return;
        const json = await response.json();
        if (!controller.signal.aborted) setSummary(json?.data ?? null);
      } catch {
        // 안내용 조회이므로 인증·네트워크 오류는 조용히 숨긴다.
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  return summary;
}
