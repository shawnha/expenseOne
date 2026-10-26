import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { FILL_SOURCE_LABEL, type FillSource } from "@/lib/deposit-prefill";
import { cn } from "@/lib/utils";

interface AutoFillBandProps {
  source: FillSource | undefined;
  children: ReactNode;
  className?: string;
}

/** 자동으로 채운 칸은 출처와 확인 문구를 함께 보여준다. 모션 없이 값 변경에 따라 표시한다. */
export function AutoFillBand({ source, children, className }: AutoFillBandProps) {
  return (
    <div
      className={cn(
        source && "min-w-0 rounded-2xl bg-[var(--apple-orange)]/10 p-3 ring-2 ring-inset ring-[var(--apple-orange)]",
        className,
      )}
    >
      {children}
      {source && (
        <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-relaxed text-[var(--apple-label)]">
          <Sparkles aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-[var(--apple-orange)]" />
          <span className="min-w-0 break-words">{FILL_SOURCE_LABEL[source]} · 맞는지 확인해주세요</span>
        </p>
      )}
    </div>
  );
}
