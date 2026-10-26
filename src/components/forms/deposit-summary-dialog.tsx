"use client";

import { useRef } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FILL_SOURCE_LABEL, type DepositSummary } from "@/lib/deposit-prefill";
import { cn } from "@/lib/utils";

interface DepositSummaryDialogProps {
  open: boolean;
  summary: DepositSummary | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DepositSummaryDialog({ open, summary, submitting, onCancel, onConfirm }: DepositSummaryDialogProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel(); }}>
      <DialogContent
        showCloseButton={false}
        initialFocus={titleRef}
        className="flex max-h-[calc(100dvh-2rem)] min-w-0 flex-col overflow-hidden sm:max-w-lg motion-reduce:animate-none motion-reduce:transition-none"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle ref={titleRef} tabIndex={-1} className="text-lg leading-snug text-[var(--apple-label)]">
            제출 전에 확인해주세요
          </DialogTitle>
          <DialogDescription className="text-[var(--apple-secondary-label)]">
            아래 내용으로 입금요청을 올립니다. 띠가 있던 칸은 자동으로 채운 값입니다.
          </DialogDescription>
        </DialogHeader>

        {/* 내용만 스크롤하고 수정·제출 버튼은 항상 보이게 둔다. */}
        {/* 키보드로도 스크롤할 수 있게 포커스를 받는다(Safari 는 포커스 없는 스크롤 영역을 키보드로 못 내린다). */}
        <dl
          tabIndex={0}
          aria-label="제출할 내용"
          className="min-h-0 min-w-0 flex-1 space-y-1 overflow-y-auto overscroll-contain rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--apple-blue)]"
        >
          {summary?.rows.map((row) => (
            <div
              key={row.key}
              className={cn(
                "grid min-w-0 gap-1.5 rounded-xl p-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3",
                row.key === "amount" && "bg-[var(--apple-blue)]/10 ring-1 ring-inset ring-[var(--apple-blue)]/20",
              )}
            >
              <dt className="text-[13px] text-[var(--apple-secondary-label)]">{row.label}</dt>
              <dd className="min-w-0 space-y-1.5 sm:text-right">
                <p className={cn(
                  "whitespace-pre-wrap break-words text-sm text-[var(--apple-label)] [overflow-wrap:anywhere]",
                  row.key === "amount" && "text-2xl font-semibold tabular-nums tracking-tight",
                  row.key === "prepay" && "tabular-nums",
                  row.warning && "flex items-start gap-1.5 font-medium text-[var(--apple-orange)] sm:justify-end",
                )}>
                  {row.warning && <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
                  <span>{row.value}</span>
                </p>
                {row.details.map((detail, index) => (
                  <p key={index} className="whitespace-pre-wrap break-words text-[12px] text-[var(--apple-secondary-label)] tabular-nums [overflow-wrap:anywhere]">
                    {detail}
                  </p>
                ))}
                {row.source && (
                  <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--apple-orange)]/40 bg-[var(--apple-orange)]/10 px-2 py-1 text-left text-[11px] font-medium text-[var(--apple-label)]">
                    <Sparkles aria-hidden="true" className="size-3 shrink-0 text-[var(--apple-orange)]" />
                    {FILL_SOURCE_LABEL[row.source]}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={onCancel} className="h-11 w-full rounded-full sm:w-auto">
            수정하기
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            aria-busy={submitting}
            className="h-11 w-full rounded-full bg-[var(--apple-blue)] text-white hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] sm:w-auto"
          >
            {submitting && <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />}
            제출
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
