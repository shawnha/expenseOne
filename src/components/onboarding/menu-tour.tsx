"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "@/components/ui/button";

const STEPS = [
  { target: "submit", title: "비용 제출", text: "이곳에서 법카 사용을 등록하거나 입금요청을 올려요." },
  { target: "expenses", title: "내 비용과 처리 상태", text: "올린 비용을 찾고 승인·반려 상태를 확인해요." },
  { target: "notifications", title: "알림", text: "새 법카 결제나 입금요청 처리 결과가 오면 여기에서 확인해요." },
  { target: "help", title: "사용법", text: "막히면 오른쪽 위 물음표에서 사용법을 찾아요. 이 메뉴 안내도 다시 볼 수 있어요." },
] as const;

type Position = { spotlight: CSSProperties; popup: CSSProperties };
const EDGE = 12;
const GAP = 16;

function measure(elements: NodeListOf<HTMLElement>): Position | null {
  const width = document.documentElement.clientWidth;
  const height = window.innerHeight;
  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom > height || rect.right > width || rect.top < 0 || rect.left < 0) continue;
    const left = Math.max(0, rect.left - 4);
    const top = Math.max(0, rect.top - 4);
    const bottom = Math.min(height, rect.bottom + 4);
    const right = Math.min(width, rect.right + 4);
    const popupWidth = Math.min(352, width - 2 * EDGE);
    const popupLeft = Math.min(width - EDGE - popupWidth, Math.max(EDGE, rect.left + (rect.width - popupWidth) / 2));
    const above = top - GAP - EDGE;
    const below = height - bottom - GAP - EDGE;

    return {
      spotlight: { left, top, width: right - left, height: bottom - top },
      popup: above > below
        ? { left: popupLeft, width: popupWidth, bottom: height - top + GAP, maxHeight: above }
        : { left: popupLeft, width: popupWidth, top: bottom + GAP, maxHeight: below },
    };
  }
  return null;
}

export default function MenuTour({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const step = STEPS[index];

  useLayoutEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>(`[data-menu-tour="${step.target}"]`);
    const update = () => setPosition(measure(elements));
    update();
    const observer = new ResizeObserver(update);
    elements.forEach((element) => observer.observe(element));
    observer.observe(document.documentElement);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step.target]);

  const last = index === STEPS.length - 1;
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[80] overflow-hidden bg-black/55" style={position ? { background: "transparent" } : undefined}>
          {position && <div
            data-tour-spotlight=""
            aria-hidden="true"
            className="pointer-events-none absolute rounded-xl border-2 border-[var(--apple-blue)] shadow-[0_0_0_100vmax_rgba(0,0,0,0.55)]"
            style={position.spotlight}
          />}
        </Dialog.Backdrop>
        <Dialog.Popup
          className="fixed z-[81] w-[calc(100%-24px)] max-w-[352px] overflow-y-auto rounded-2xl bg-[var(--apple-system-background)] p-4 text-[var(--apple-label)] shadow-xl outline-none"
          style={position?.popup ?? { left: "50%", top: "50%", translate: "-50% -50%", maxHeight: "calc(100dvh - 24px)" }}
          initialFocus={nextButton}
        >
          <div aria-live="polite" className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <Dialog.Title className="text-base font-semibold">{step.title}</Dialog.Title>
              <span className="shrink-0 text-footnote tabular-nums text-[var(--apple-secondary-label)]">{index + 1}/{STEPS.length}</span>
            </div>
            <Dialog.Description className="break-keep text-footnote leading-relaxed text-[var(--apple-secondary-label)]">{step.text}</Dialog.Description>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-1">
            <Button type="button" size="lg" variant="ghost" onClick={onClose}>건너뛰기</Button>
            <div className="flex items-center gap-1">
              {index > 0 && <Button type="button" size="lg" variant="outline" onClick={() => {
                if (index === 1) nextButton.current?.focus();
                setIndex(index - 1);
              }}>이전</Button>}
              <Button ref={nextButton} type="button" size="lg" onClick={() => last ? onClose() : setIndex(index + 1)}>
                {last ? "완료" : "다음"}
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
