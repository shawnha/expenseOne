"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getTourSteps, lastStepLabel, type TourArt, type TourRole } from "./tour-steps";
import s from "./welcome-tour.module.css";

const v = (name: string) => ({ fill: `var(--apple-${name})` });
const st = (name: string) => ({ stroke: `var(--apple-${name})` });
const FILL = { fill: "var(--apple-tertiary-system-fill)" };
const LABEL = { fill: "var(--apple-label)" };
const SUB = { fill: "var(--apple-secondary-label)" };
const cx = (...c: string[]) => c.join(" ");

function Art({ art, isDesktop }: { art: TourArt; isDesktop: boolean }) {
  switch (art) {
    case "welcome":
      return (
        <>
          <rect x="100" y="52" width="80" height="116" rx="14" style={FILL} strokeWidth="2" {...{ stroke: "var(--apple-separator)" }} />
          <rect x="116" y="60" width="48" height="6" rx="3" style={v("blue")} className={s.phoneGlow} />
          {[0, 1, 2].map((i) => (
            <g key={i} className={cx(s.box, s.rcpt, i === 1 ? s.rcpt2 : i === 2 ? s.rcpt3 : "")}>
              <rect x={112 + i * 16} y="2" width="24" height="34" rx="3" style={{ fill: "var(--apple-label)", opacity: 0.9 }} />
              <rect x={117 + i * 16} y="9" width="14" height="2.5" rx="1" style={{ fill: "var(--apple-blue)" }} />
              <rect x={117 + i * 16} y="16" width="10" height="2.5" rx="1" style={{ fill: "var(--apple-secondary-label)" }} />
              <rect x={117 + i * 16} y="23" width="14" height="2.5" rx="1" style={{ fill: "var(--apple-secondary-label)" }} />
            </g>
          ))}
        </>
      );
    case "create": {
      const labels = ["법카사용", "입금요청", "반품/환불"];
      const colors = ["blue", "orange", "green"];
      const barY = isDesktop ? 12 : 128;
      const plusCx = isDesktop ? 214 : 140;
      const plusCy = barY + 20;
      return (
        <>
          <rect x="20" y={barY} width="240" height="40" rx={isDesktop ? 12 : 20} style={FILL} strokeWidth="1.5" {...{ stroke: "var(--apple-separator)" }} />
          {!isDesktop && [50, 90, 190, 230].map((x) => <circle key={x} cx={x} cy={plusCy} r="5" style={SUB} opacity="0.5" />)}
          {isDesktop && <rect x="32" y={barY + 16} width="60" height="8" rx="4" style={SUB} opacity="0.4" />}
          <circle cx={plusCx} cy={plusCy} r="18" className={cx(s.box, s.ripple)} style={v("blue")} />
          {isDesktop ? (
            <g className={cx(s.box, s.plus)}>
              <rect x="176" y={barY + 7} width="76" height="26" rx="13" style={v("blue")} />
              <path d={`M192 ${plusCy}h10M197 ${plusCy - 5}v10`} strokeWidth="2.2" strokeLinecap="round" style={{ stroke: "#fff" }} />
              <rect x="208" y={plusCy - 3} width="36" height="6" rx="3" style={{ fill: "#fff" }} />
            </g>
          ) : (
            <g className={cx(s.box, s.plus)}>
              <circle cx={plusCx} cy={plusCy} r="17" style={v("blue")} />
              <path d={`M${plusCx - 7} ${plusCy}h14M${plusCx} ${plusCy - 7}v14`} strokeWidth="2.5" strokeLinecap="round" style={{ stroke: "#fff" }} />
            </g>
          )}
          {labels.map((l, i) => (
            <g key={l} className={cx(s.box, s.riseCard, i === 1 ? s.rise2 : i === 2 ? s.rise3 : "")}>
              <rect x={22 + i * 82} y={isDesktop ? 78 : 46} width="74" height="52" rx="12" style={FILL} strokeWidth="1.5" {...{ stroke: "var(--apple-separator)" }} />
              <circle cx={59 + i * 82} cy={(isDesktop ? 78 : 46) + 18} r="7" style={v(colors[i])} />
              <text x={59 + i * 82} y={(isDesktop ? 78 : 46) + 42} textAnchor="middle" fontSize="11" fontWeight="600" style={LABEL}>{l}</text>
            </g>
          ))}
        </>
      );
    }
    case "card":
      return (
        <>
          <rect x="84" y="46" width="34" height="74" rx="8" style={FILL} strokeWidth="1.5" {...{ stroke: "var(--apple-separator)" }} />
          <rect x="90" y="54" width="22" height="12" rx="3" style={v("green")} opacity="0.7" />
          <g className={s.swipeCard}>
            <rect x="10" y="62" width="48" height="30" rx="5" style={v("blue")} />
            <rect x="10" y="68" width="48" height="6" style={{ fill: "#fff" }} opacity="0.45" />
            <rect x="15" y="82" width="14" height="4" rx="2" style={{ fill: "#fff" }} opacity="0.8" />
          </g>
          <g className={cx(s.box, s.paperWobble)}>
            <rect x="162" y="34" width="96" height="116" rx="12" style={FILL} strokeWidth="1.5" {...{ stroke: "var(--apple-separator)" }} />
            <rect x="174" y="48" width="40" height="7" rx="3.5" style={SUB} opacity="0.5" />
            <rect x="174" y="72" width="72" height="16" rx="8" style={{ fill: "var(--apple-tertiary-system-fill)" }} />
            <rect x="174" y="72" width="72" height="16" rx="8" className={s.fill1} style={v("blue")} opacity="0.55" />
            <rect x="174" y="98" width="72" height="16" rx="8" style={{ fill: "var(--apple-tertiary-system-fill)" }} />
            <rect x="174" y="98" width="72" height="16" rx="8" className={s.fill2} style={v("blue")} opacity="0.55" />
            <path d="M200 134l7 7 13-14" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={s.tick} style={st("green")} />
          </g>
          <g className={cx(s.box, s.badge)}>
            <circle cx="256" cy="36" r="11" style={v("red")} />
            <text x="256" y="40.5" textAnchor="middle" fontSize="12" fontWeight="700" style={{ fill: "#fff" }}>1</text>
          </g>
        </>
      );
    case "deposit":
      return (
        <>
          <rect x="44" y="22" width="84" height="98" rx="10" style={FILL} strokeWidth="1.5" {...{ stroke: "var(--apple-separator)" }} />
          {[40, 54, 68, 82].map((y, i) => (
            <rect key={y} x="56" y={y} width={i === 3 ? 30 : 60} height="5" rx="2.5" style={SUB} opacity="0.4" />
          ))}
          <path className={s.clip} d="M120 18v26a7 7 0 0 1-14 0V16a4.5 4.5 0 0 1 9 0v26" fill="none" strokeWidth="2.5" strokeLinecap="round" style={st("orange")} />
          <g className={s.bank}>
            <rect x="150" y="44" width="86" height="54" rx="10" style={v("blue")} />
            <rect x="150" y="56" width="86" height="10" style={{ fill: "#fff" }} opacity="0.4" />
            <rect x="162" y="78" width="34" height="5" rx="2.5" style={{ fill: "#fff" }} opacity="0.85" />
            <rect x="162" y="87" width="22" height="4" rx="2" style={{ fill: "#fff" }} opacity="0.6" />
          </g>
          <g className={cx(s.box, s.chipA)}>
            <rect x="100" y="136" width="80" height="30" rx="15" style={v("blue")} opacity="0.18" />
            <text x="140" y="156" textAnchor="middle" fontSize="13" fontWeight="600" style={v("blue")}>제출</text>
          </g>
          <g className={cx(s.box, s.chipB)}>
            <rect x="100" y="136" width="80" height="30" rx="15" style={v("green")} opacity="0.2" />
            <path d="M118 151l5 5 9-10" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={st("green")} />
            <text x="152" y="156" textAnchor="middle" fontSize="13" fontWeight="600" style={v("green")}>승인</text>
          </g>
        </>
      );
    case "status": {
      const chips = [
        ["제출", "blue", 38, 86],
        ["승인", "green", 150, 86],
        ["반려", "red", 38, 128],
        ["취소", "secondary-label", 150, 128],
      ] as const;
      return (
        <>
          <g className={s.bell}>
            <path d="M140 14c-12 0-18 9-18 20v10l-6 8h48l-6-8V34c0-11-6-20-18-20z" style={v("orange")} />
            <circle cx="140" cy="62" r="5" style={v("orange")} />
          </g>
          {chips.map(([label, color, x, y], i) => (
            <g key={label} className={cx(s.box, s.pop, i === 1 ? s.pop2 : i === 2 ? s.pop3 : i === 3 ? s.pop4 : "")}>
              <rect x={x} y={y} width="92" height="30" rx="15" style={v(color)} opacity="0.18" />
              <circle cx={x + 16} cy={y + 15} r="4.5" style={v(color)} />
              <text x={x + 56} y={y + 20} textAnchor="middle" fontSize="13" fontWeight="600" style={v(color)}>{label}</text>
            </g>
          ))}
        </>
      );
    }
    case "admin":
      return (
        <>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x="30" y={18 + i * 36} width="220" height="28" rx="10" style={FILL} strokeWidth="1.5" {...{ stroke: "var(--apple-separator)" }} />
              <circle cx="48" cy={32 + i * 36} r="8" style={FILL} strokeWidth="1.5" {...{ stroke: "var(--apple-separator)" }} />
              <rect x="66" y={29 + i * 36} width={90 - i * 12} height="6" rx="3" style={SUB} opacity="0.4" />
              <rect x="196" y={29 + i * 36} width="40" height="6" rx="3" style={SUB} opacity="0.4" />
              <g className={cx(s.box, s.rowCheck, i === 1 ? s.rc2 : i === 2 ? s.rc3 : "")}>
                <circle cx="48" cy={32 + i * 36} r="8" style={v("green")} />
                <path d={`M44 ${32 + i * 36}l3 3 5-6`} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "#fff" }} />
              </g>
            </g>
          ))}
          <g className={cx(s.box, s.bulk)}>
            <rect x="86" y="134" width="108" height="34" rx="17" style={v("blue")} />
            <text x="140" y="156" textAnchor="middle" fontSize="13" fontWeight="600" style={{ fill: "#fff" }}>일괄 승인</text>
          </g>
        </>
      );
    case "done": {
      const sparks: [number, number][] = [[-62, -40], [64, -34], [-54, 46], [58, 50], [0, -66], [0, 68]];
      return (
        <>
          <circle cx="140" cy="90" r="44" fill="none" strokeWidth="6" strokeLinecap="round" className={s.ring} style={st("green")} transform="rotate(-90 140 90)" />
          <path d="M120 91l14 14 27-30" fill="none" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" className={s.checkMark} style={st("green")} />
          {sparks.map(([dx, dy], i) => (
            <circle
              key={i}
              cx="140"
              cy="90"
              r={i % 2 ? 3.5 : 5}
              className={cx(s.box, s.spark)}
              style={{ fill: `var(--apple-${i % 3 === 0 ? "orange" : i % 3 === 1 ? "blue" : "green"})`, ["--dx" as string]: `${dx}px`, ["--dy" as string]: `${dy}px` }}
            />
          ))}
        </>
      );
    }
  }
}

export default function WelcomeTour({
  role,
  open,
  onClose,
}: {
  role: TourRole;
  open: boolean;
  onClose: () => void;
}) {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const steps = useMemo(() => getTourSteps(role, isDesktop), [role, isDesktop]);
  const last = steps.length - 1;
  const step = steps[Math.min(index, last)];

  const next = useCallback(() => {
    if (index >= last) onClose();
    else setIndex(index + 1);
  }, [index, last, onClose]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev]);

  const pill =
    "apple-press inline-flex min-h-[44px] items-center justify-center rounded-full px-5 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--apple-blue)] focus-visible:ring-offset-2";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent showCloseButton={false} className="gap-4 p-5 sm:max-w-md">
        <div
          className="h-[180px] w-full touch-pan-y select-none overflow-hidden rounded-xl"
          onPointerDown={(e) => { startX.current = e.clientX; }}
          onPointerUp={(e) => {
            if (startX.current == null) return;
            const dx = e.clientX - startX.current;
            startX.current = null;
            if (dx <= -40) next();
            else if (dx >= 40) prev();
          }}
          onPointerCancel={() => { startX.current = null; }}
        >
          <svg key={step.id} viewBox="0 0 280 180" className={cx(s.art, "h-full w-full")} aria-hidden="true" focusable="false">
            <Art art={step.art} isDesktop={isDesktop} />
          </svg>
        </div>

        <div className="space-y-2">
          <DialogTitle className="text-title3 leading-[25px] text-[var(--apple-label)]">
            {step.title}
          </DialogTitle>
          <DialogDescription className="space-y-1.5 text-callout text-[var(--apple-secondary-label)]">
            {step.body.map((t) => (
              <span key={t} className="block">{t}</span>
            ))}
          </DialogDescription>
        </div>

        <div className="flex items-center justify-center gap-1.5" role="img" aria-label={`${steps.length}단계 중 ${index + 1}단계`}>
          {steps.map((x, i) => (
            <span
              key={x.id}
              aria-hidden="true"
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === index ? "w-5 bg-[var(--apple-blue)]" : "w-1.5 bg-[var(--apple-separator)]",
              )}
            />
          ))}
          <span className="sr-only" aria-live="polite">{index + 1} / {steps.length}</span>
        </div>

        {/* 「다음」을 DOM 앞에 두고 화면에서는 오른쪽에 — 창이 열릴 때 초점이 주 버튼으로 간다(건너뛰기에 초점 테두리가 뜨던 것). */}
        <div className="flex flex-row-reverse items-center justify-between gap-3">
          <button
            type="button"
            onClick={next}
            className={cn(pill, "min-w-[104px] bg-[var(--apple-blue)] text-white hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)]")}
          >
            {index >= last ? lastStepLabel() : "다음"}
          </button>
          {index === 0 ? (
            <button key="skip" type="button" onClick={onClose} className={cn(pill, "text-[var(--apple-secondary-label)] hover:bg-[var(--apple-tertiary-system-fill)]")}>
              건너뛰기
            </button>
          ) : (
            <button key="prev" type="button" onClick={prev} className={cn(pill, "text-[var(--apple-secondary-label)] hover:bg-[var(--apple-tertiary-system-fill)]")}>
              이전
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
