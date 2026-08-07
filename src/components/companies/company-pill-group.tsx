"use client";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 회사 선택 pill 그룹 — 비용 등록 폼, 설정, 관리자 필터, 첫 진입 모달에서 쓴다.
//
// 네 곳에 같은 마크업이 복사돼 있어서, 한아원파트너스가 추가돼 회사가 4개가
// 됐을 때 네 곳이 동시에 넘쳤다. 여기로 합쳐서 폭 문제를 한 번만 풀고,
// 나중에 회사가 더 늘어 드롭다운/검색으로 바꿔야 할 때도 여기만 고치면 되게 한다.
//
// 넘침 대응이 두 가지라 layout으로 나눈다:
//  - "scroll" (기본): pill 바 안에서만 가로 스크롤. 페이지가 밀리지 않는다.
//  - "grid": 2열로 접는다. 첫 진입 모달처럼 **반드시 하나를 골라야 하는**
//    화면은 스크롤로 항목을 숨기면 안 되기 때문.
// ---------------------------------------------------------------------------

export interface CompanyPillOption {
  /** 선택 식별자. 회사 id일 수도, slug일 수도 있다(필터의 "전체"는 빈 문자열). */
  key: string;
  label: string;
}

interface CompanyPillGroupProps {
  options: CompanyPillOption[];
  value: string;
  onChange: (key: string) => void;
  ariaLabel: string;
  layout?: "scroll" | "grid";
  /** 선택된 pill 색. 등록 폼에서 '내 소속이 아닌 회사'를 고르면 주황으로 경고한다. */
  selectedTone?: "blue" | "orange";
  className?: string;
}

const TONE_CLASS = {
  blue: "bg-[var(--apple-blue)] text-white shadow-[0_2px_8px_rgba(0,122,255,0.25)]",
  orange: "bg-[var(--apple-orange)] text-white shadow-[0_2px_8px_rgba(255,149,0,0.3)]",
} as const;

const UNSELECTED_CLASS =
  "text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]";

const CONTAINER_CLASS =
  "bg-[var(--apple-system-grouped-background)] border border-[var(--glass-border)]";

export function CompanyPillGroup({
  options,
  value,
  onChange,
  ariaLabel,
  layout = "scroll",
  selectedTone = "blue",
  className,
}: CompanyPillGroupProps) {
  if (options.length === 0) return null;

  if (layout === "grid") {
    // 3개까지는 한 줄, 그 이상은 2열. 홀수면 마지막이 두 칸을 차지해 빈 칸을
    // 남기지 않는다.
    const columns = options.length <= 3 ? options.length : 2;
    return (
      <div
        className={cn("grid gap-1 p-1 rounded-xl", CONTAINER_CLASS, className)}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        role="radiogroup"
        aria-label={ariaLabel}
      >
        {options.map((opt, index) => {
          const isSelected = value === opt.key;
          const spansFullRow =
            options.length > 3 &&
            options.length % 2 === 1 &&
            index === options.length - 1;
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(opt.key)}
              className={cn(
                "px-3 py-2 text-[13px] font-medium rounded-[10px] transition-all duration-200 truncate",
                spansFullRow && "col-span-2",
                isSelected ? TONE_CLASS[selectedTone] : UNSELECTED_CLASS,
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    // min-w-0은 부서 관리처럼 flex row 안에 놓였을 때 줄어들 수 있게 한다.
    // 없으면 flex 자식이 콘텐츠 폭을 그대로 유지해 스크롤이 걸리지 않는다.
    <div className={cn("max-w-full min-w-0 overflow-x-auto py-2 -my-2", className)}>
      <div
        className={cn("inline-flex p-1 rounded-full", CONTAINER_CLASS)}
        role="radiogroup"
        aria-label={ariaLabel}
      >
        {options.map((opt) => {
          const isSelected = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(opt.key)}
              className={cn(
                "relative px-4 py-1.5 text-[13px] font-medium rounded-full transition-all duration-200 whitespace-nowrap",
                isSelected ? TONE_CLASS[selectedTone] : UNSELECTED_CLASS,
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
