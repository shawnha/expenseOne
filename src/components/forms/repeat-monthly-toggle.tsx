"use client";

import React from "react";
import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { firstRunOnOrAfter } from "@/lib/recurring-schedule";

export type RepeatMode = "REMIND" | "AUTO";

export interface RepeatMonthlyValue {
  enabled: boolean;
  dayOfMonth: number;
  mode: RepeatMode;
}

/** 오늘 날짜의 일(1~31)을 기본값으로 한 꺼진 상태. */
export function defaultRepeatMonthly(): RepeatMonthlyValue {
  return { enabled: false, dayOfMonth: new Date().getDate(), mode: "REMIND" };
}

/** 이번 달 회차는 방금 올린 요청이라, 다음 달 1일 이후 첫 예정일부터 시작한다. */
export function repeatStartsOn(dayOfMonth: number): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const from = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return firstRunOnOrAfter({ frequency: "MONTHLY", intervalCount: 1, dayOfMonth }, from);
}

export function repeatDayLabel(day: number): string {
  return day >= 29 ? `${day}일 (없는 달은 말일)` : `${day}일`;
}

interface Props {
  value: RepeatMonthlyValue;
  onChange: (v: RepeatMonthlyValue) => void;
}

const MODES: { value: RepeatMode; label: string }[] = [
  { value: "REMIND", label: "다음 달부터 날짜가 되면 알림 받기" },
  { value: "AUTO", label: "같은 금액으로 자동 제출" },
];

export function RepeatMonthlyToggle({ value, onChange }: Props) {
  return (
    <div className="glass p-5 mt-4">
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
          className="size-5 rounded-md border-2 border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] accent-[var(--apple-blue)] cursor-pointer"
        />
        <Repeat className="size-4 text-[var(--apple-secondary-label)]" />
        <span className="text-sm font-medium text-[var(--apple-label)]">매달 반복</span>
      </label>

      {value.enabled && (
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--apple-label)]">매달</span>
            <select
              aria-label="반복 일자"
              value={value.dayOfMonth}
              onChange={(e) => onChange({ ...value, dayOfMonth: Number(e.target.value) })}
              className="h-11 rounded-xl border border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)] px-3 text-sm"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {repeatDayLabel(d)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2" role="radiogroup" aria-label="반복 방식">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={value.mode === m.value}
                onClick={() => onChange({ ...value, mode: m.value })}
                className={cn(
                  "min-h-11 rounded-full px-4 py-2 text-left text-[13px] font-medium transition-colors border",
                  value.mode === m.value
                    ? "bg-[var(--apple-blue)] text-white border-transparent"
                    : "glass-subtle text-[var(--apple-secondary-label)] border-[var(--glass-border)]"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <p className="text-[12px] text-[var(--apple-secondary-label)]">
            다음 달부터 시작해요. 반복 지급 화면에서 고치거나 비용계획에도 표시할 수 있어요.
          </p>
        </div>
      )}
    </div>
  );
}
