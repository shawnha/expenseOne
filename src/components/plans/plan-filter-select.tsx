"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

interface PlanFilterSelectProps {
  label: string;
  value: string;
  allLabel: string;
  options: Array<{ value: string; label: string; hint?: string }>;
  onChange: (value: string) => void;
}

/** 항목 수나 이름 길이에 관계없이 선택값은 한 칸, 목록은 세로로 표시한다. */
export function PlanFilterSelect({ label, value, allLabel, options, onChange }: PlanFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  const selectedLabel = value ? selected?.label ?? `선택한 ${label}` : allLabel;

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <span className="block text-caption1 text-[var(--apple-secondary-label)]">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button variant="outline" />}
          role="combobox"
          aria-expanded={open}
          aria-label={`${label} 필터: ${selectedLabel}${selected?.hint ? ` (${selected.hint})` : ""}`}
          className="min-h-11 w-full min-w-0 justify-between gap-2 rounded-lg px-3 text-sm font-normal"
        >
          <span className="min-w-0 truncate text-left">{selectedLabel}</span>
          <ChevronDown className="size-4 shrink-0 text-[var(--apple-secondary-label)]" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-0">
          <Command>
            <CommandInput placeholder={`${label} 검색`} aria-label={`${label} 검색`} />
            <CommandList>
              <CommandEmpty>검색 결과가 없습니다.</CommandEmpty>
              <CommandGroup>
                {[{ value: "", label: allLabel, hint: undefined }, ...options].map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value || "__all__"}
                    keywords={[option.label, option.hint ?? ""]}
                    data-checked={option.value === value}
                    aria-selected={option.value === value}
                    className="min-h-11 items-center py-2"
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block break-words whitespace-normal">{option.label}</span>
                      {option.hint && <span className="block text-xs text-[var(--apple-secondary-label)]">{option.hint}</span>}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
