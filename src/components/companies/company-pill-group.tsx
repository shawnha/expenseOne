"use client";

import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// ---------------------------------------------------------------------------
// 회사 선택 컨트롤 — 비용 등록 폼, 설정, 관리자 필터, 첫 진입 모달에서 쓴다.
//
// 네 곳에 같은 마크업이 복사돼 있어서, 한아원파트너스가 추가돼 회사가 4개가
// 됐을 때 네 곳이 동시에 넘쳤다. 여기로 합쳐서 폭 문제를 한 번만 푼다.
//
// **개수에 따라 형태가 자동으로 바뀐다.** 법인이 늘어도 호출부는 그대로다.
//   pill  — 한눈에 다 보이고 한 번에 고를 수 있는 구간
//   드롭다운 — pill로는 넘치는 구간. 항목이 아주 많아지면 검색창까지 붙는다
//
// 넘침 대응이 두 가지라 layout으로 나눈다:
//  - "scroll" (기본): pill 바 안에서만 가로 스크롤. 페이지가 밀리지 않는다.
//  - "grid": 2열로 접는다. 첫 진입 모달처럼 **반드시 하나를 골라야 하는**
//    화면은 스크롤로 항목을 숨기면 안 되기 때문.
// ---------------------------------------------------------------------------

/**
 * pill로 둘 수 있는 최대 개수.
 *
 * scroll은 넘치면 가로 스크롤이라 **항목이 시야 밖으로 숨는다.** 모바일에서
 * 5개를 넘으면 뒤쪽 회사가 보이지 않아 선택지가 있다는 것조차 모르게 된다.
 * grid는 접혀서 다 보이므로 더 버틴다.
 */
const PILL_MAX_SCROLL = 5;
const PILL_MAX_GRID = 8;

/** 드롭다운 안에 검색창을 붙이기 시작하는 개수. 이하면 스크롤로 충분하다. */
const SEARCH_MIN = 12;

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

  // 개수가 많아지면 pill을 포기하고 드롭다운으로 바꾼다.
  //
  // 세는 대상은 **회사 개수**다. 필터의 "전체"(key === "")는 두 글자짜리라
  // 폭을 거의 안 먹는데, 이걸 같이 세면 회사 5개짜리 조직에서 등록 폼은 pill,
  // 관리자 필터는 드롭다운이 돼 같은 화면 흐름 안에서 형태가 달라진다.
  const companyCount = options.filter((o) => o.key !== "").length;
  const pillMax = layout === "grid" ? PILL_MAX_GRID : PILL_MAX_SCROLL;
  if (companyCount > pillMax) {
    return (
      <CompanyDropdown
        options={options}
        value={value}
        onChange={onChange}
        ariaLabel={ariaLabel}
        selectedTone={selectedTone}
        className={className}
      />
    );
  }

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

// ---------------------------------------------------------------------------
// 드롭다운 — 회사가 많아 pill로 담을 수 없을 때
// ---------------------------------------------------------------------------

/**
 * 트리거는 pill과 같은 모양을 유지한다. 개수 때문에 형태가 바뀌어도 화면의
 * 다른 pill들과 따로 놀지 않아야 한다.
 */
function CompanyDropdown({
  options,
  value,
  onChange,
  ariaLabel,
  selectedTone,
  className,
}: Required<Pick<CompanyPillGroupProps, "options" | "value" | "onChange" | "ariaLabel" | "selectedTone">> &
  Pick<CompanyPillGroupProps, "className">) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.key === value);
  const showSearch = options.length >= SEARCH_MIN;

  // value가 목록에 없을 수 있다. 관리자 필터는 URL에서 slug를 읽는데 목록은
  // **활성 회사만** 내려오므로, 비활성화된 회사로 필터된 링크를 열면 매칭이
  // 안 된다. 이때 "회사 선택"을 미선택 스타일로 보여주면 필터가 안 걸린 것처럼
  // 보이는데 서버는 여전히 그 회사로 걸러낸다 — 숫자만 이상해 보인다.
  // 그래서 값 자체를 선택된 모양으로 드러낸다.
  const hasUnknownValue = !selected && value !== "";
  const triggerLabel = selected?.label ?? (hasUnknownValue ? value : "회사 선택");
  const looksSelected = Boolean(selected) || hasUnknownValue;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        // 트리거에 aria-label을 그대로 두면 그 이름이 내용을 덮어써서 스크린
        // 리더가 현재 선택을 못 읽는다. 라벨에 선택값을 함께 넣는다.
        aria-label={`${ariaLabel}: ${triggerLabel}`}
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-200",
          looksSelected
            ? TONE_CLASS[selectedTone]
            : cn(CONTAINER_CLASS, UNSELECTED_CLASS),
          className,
        )}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70" />
      </PopoverTrigger>
      {/* 첫 진입 모달(z-[9999]) 안에서도 쓰인다. 기본 z-50이면 모달 뒤에 깔려
          항목이 보이기만 하고 클릭이 모달에 먹힌다 — 회사가 9개를 넘는 순간
          모달이 grid에서 드롭다운으로 바뀌면서 선택 자체가 막힌다. */}
      <PopoverContent
        className="w-[240px] p-0"
        positionerClassName="z-[10000]"
        align="start"
      >
        <Command>
          {showSearch && <CommandInput placeholder="회사 검색..." />}
          <CommandList>
            <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.key}
                  // cmdk는 value로 검색한다. label을 넘겨야 한글 회사명이 검색된다.
                  value={opt.label}
                  onSelect={() => {
                    onChange(opt.key);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-4",
                      opt.key === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{opt.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
