"use client";

import { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// 로딩이 안 끝날 때 빠져나갈 길을 준다.
//
// PWA 창에는 주소창이 없다. 화면이 스켈레톤에서 멈추면 사용자가 할 수 있는 게
// 우클릭 → Reload 뿐이고, 그마저도 메뉴를 열어봐야 안다. 실제로 그 상태로
// 갇힌 제보가 반복됐다(2026-08-07 / 08-19 / 08-27 / 08-28).
//
// 원인은 그때그때 달랐다 — rAF 리빌 누락, 배포 후 청크 404. 원인을 하나씩
// 막는 것과 별개로, **무엇이 원인이든** 사용자가 스스로 벗어날 수 있어야 한다.
//
// 진단 정보를 함께 보여주는 이유: PWA는 콘솔을 열 수 없어서 제보가 항상
// 스크린샷뿐이다. 화면에 상태를 찍어두면 그 스크린샷만으로 원인을 좁힐 수 있다.
// ---------------------------------------------------------------------------

/** 이 시간 넘게 스켈레톤이 남아 있으면 갇힌 것으로 본다. */
const STUCK_AFTER_MS = 10000;

interface Diagnostics {
  queue: number | null;
  hidden: number;
  online: boolean;
  visibility: string;
  /** 이 페이지가 나온 빌드. */
  build: string;
  /** 서버가 지금 서비스하는 빌드. 위와 다르면 배포 스큐다. */
  live: string;
  stale: boolean;
}

async function collect(): Promise<Diagnostics> {
  const w = window as unknown as { $RB?: unknown[] };
  const build = document.documentElement.dataset.build ?? "?";
  let live = "?";
  try {
    const res = await fetch("/build-info.json", { cache: "no-store" });
    if (res.ok) live = (await res.json())?.hash ?? "?";
  } catch {
    /* 오프라인이면 못 읽는다 — net 값으로 구분된다. */
  }
  return {
    // 스트리밍 대기 큐. 0이 아니면 "내용은 왔는데 안 드러난" 것,
    // 0이면 "내용이 아예 안 왔다" — 원인이 정반대로 갈린다.
    queue: Array.isArray(w.$RB) ? w.$RB.length : null,
    hidden: document.querySelectorAll("div[hidden]").length,
    online: navigator.onLine,
    visibility: document.visibilityState,
    build,
    live,
    stale: build !== "?" && live !== "?" && build !== live,
  };
}

export function StuckLoaderNotice() {
  const [diag, setDiag] = useState<Diagnostics | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      // 스켈레톤은 animate-pulse로 통일돼 있다. 남아 있으면 아직 안 끝난 것.
      if (!document.querySelector(".animate-pulse")) return;
      collect().then((d) => {
        if (!cancelled) setDiag(d);
      });
    }, STUCK_AFTER_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!diag) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-4 z-[9998] mx-auto w-[min(92vw,26rem)] rounded-2xl border border-[var(--glass-border)] bg-[var(--apple-system-background)] p-4 shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
    >
      <p className="text-sm font-medium text-[var(--apple-label)]">
        화면 불러오기가 오래 걸립니다
      </p>
      <p className="mt-1 text-xs text-[var(--apple-secondary-label)]">
        {diag.stale
          ? "새 버전이 배포됐습니다. 다시 불러오면 해결됩니다."
          : "다시 불러오면 대부분 해결됩니다."}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-9 flex-1 rounded-full bg-[var(--apple-blue)] px-4 text-sm font-medium text-white"
        >
          다시 불러오기
        </button>
        <button
          type="button"
          onClick={() => setDiag(null)}
          className="h-9 rounded-full px-3 text-sm text-[var(--apple-secondary-label)]"
        >
          닫기
        </button>
      </div>
      {/* 스크린샷 한 장으로 원인을 좁히기 위한 상태값. */}
      <p className="mt-2 font-mono text-[10px] leading-relaxed text-[var(--apple-tertiary-label)]">
        q={String(diag.queue)} h={diag.hidden} net={diag.online ? "on" : "off"}{" "}
        vis={diag.visibility} b={diag.build}
        {diag.stale ? `→${diag.live} (구버전)` : ""}
      </p>
    </div>
  );
}
