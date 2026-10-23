"use client";

import React from "react";
import { ScanText } from "lucide-react";

/**
 * 사진(OCR)에서 읽은 값 제안 한 줄. 누르면 적용 — 자동으로 넣지 않는다.
 * 모양은 입금요청 폼의 「지난번 계좌 불러오기」 버튼과 같다.
 */
export function OcrSuggestion({
  label,
  value,
  actionLabel = "적용",
  onApply,
}: {
  label: string;
  value: React.ReactNode;
  actionLabel?: string;
  onApply: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onApply}
      className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2 text-left glass-input sm:min-h-9"
    >
      <ScanText className="size-4 shrink-0 text-[var(--apple-blue)]" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--apple-secondary-label)]">
        {label} <span className="font-medium text-[var(--apple-label)]">{value}</span>
      </span>
      <span className="shrink-0 text-[13px] font-semibold text-[var(--apple-blue)]">{actionLabel}</span>
    </button>
  );
}

/** 적용할 수 없는 참고 안내 (외화 금액, 고위드 결제와 다른 금액 등) */
export function OcrNotice({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  return (
    <div
      role="status"
      className={
        tone === "warn"
          ? "flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] bg-[color-mix(in_srgb,var(--apple-orange)_14%,transparent)] text-[var(--apple-label)]"
          : "flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] glass-input text-[var(--apple-secondary-label)]"
      }
    >
      <ScanText className="mt-0.5 size-4 shrink-0 text-[var(--apple-blue)]" aria-hidden />
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
