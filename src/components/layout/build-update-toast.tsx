"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

const STORAGE_KEY = "expenseone-build-hash";

export function BuildUpdateToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    async function check() {
      try {
        const res = await fetch("/build-info.json", { cache: "no-store" });
        if (!res.ok) return;
        const { hash } = await res.json();
        if (!hash) return;

        const storedHash = localStorage.getItem(STORAGE_KEY);

        if (storedHash && storedHash !== hash) {
          setShow(true);
          timer = setTimeout(() => setShow(false), 4000);
        }

        localStorage.setItem(STORAGE_KEY, hash);
      } catch {
        // fetch or localStorage unavailable
      }
    }

    check();
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div
      className="fixed top-[calc(3.75rem+0.5rem)] left-4 right-4 z-[100] sm:left-auto sm:right-4 sm:w-80"
      style={{ animation: "fadeInUp 0.3s ease" }}
    >
      <div className="flex items-center gap-3 p-3 rounded-2xl backdrop-blur-xl bg-white/90 dark:bg-[rgba(58,58,60,0.9)] shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-[var(--apple-separator)]">
        <div className="flex items-center justify-center size-9 rounded-xl bg-[rgba(52,199,89,0.12)] shrink-0">
          <CheckCircle2 className="size-4 text-[var(--apple-green)]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-[var(--apple-label)]">
            새 버전으로 업데이트되었습니다
          </p>
          <p className="text-[11px] text-[var(--apple-secondary-label)]">
            최신 기능이 적용되었어요
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="shrink-0 text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] text-[18px] leading-none p-1"
          aria-label="닫기"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
