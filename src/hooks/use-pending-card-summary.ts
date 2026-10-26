"use client";

import { useEffect, useState } from "react";
import type { PendingCardSummary } from "@/services/card-batch.service";

/** enabled 가 false 면 부르지 않는다(안내 링크가 안 보이는 화면에서 쓸데없는 요청을 막는다) */
export function usePendingCardSummary(enabled = true) {
  const [summary, setSummary] = useState<PendingCardSummary | null>(null);

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);

  return summary;
}
