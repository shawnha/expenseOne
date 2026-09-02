"use client";

import type { VatMode } from "@/lib/utils/vat";

// ---------------------------------------------------------------------------
// 입력 금액이 부가세 별도인지 포함인지 고른다.
//
// 예전엔 「VAT 포함 (+10%)」 체크박스 하나였는데, 켜면 10%를 **더하는** 동작인데
// 글자는 "내가 넣은 금액이 부가세 포함"으로 읽혀 정반대로 이해됐다
// (사용자 제보 2026-09-02). 그래서 체크가 아니라 **입력 금액의 성격**을 고르게
// 바꿨다 — 두 선택지가 나란히 보이면 어느 쪽인지 헷갈릴 여지가 없다.
//
// 동작은 그대로다: 별도 = 이전의 체크 켠 상태, 포함 = 체크 끈 상태.
// ---------------------------------------------------------------------------

const OPTIONS: { value: VatMode; label: string; hint: string }[] = [
  { value: "INCLUSIVE", label: "부가세 포함", hint: "입력한 금액이 최종 금액" },
  { value: "EXCLUSIVE", label: "부가세 별도", hint: "입력한 금액에 10%를 더함" },
];

export function VatModeSelect({
  value,
  onChange,
  label = "입력 금액",
}: {
  value: VatMode;
  onChange: (v: VatMode) => void;
  label?: string;
}) {
  return (
    <div>
      <span className="mb-1 block text-[13px] text-[var(--apple-secondary-label)]">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="inline-flex rounded-full bg-[var(--apple-system-grouped-background)] p-0.5"
      >
        {OPTIONS.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(o.value)}
              title={o.hint}
              className={`h-9 rounded-full px-3.5 text-[13px] transition-colors ${
                active
                  ? "bg-[var(--apple-blue)] text-white"
                  : "text-[var(--apple-secondary-label)]"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[12px] text-[var(--apple-tertiary-label)]">
        {OPTIONS.find((o) => o.value === value)?.hint}
      </p>
    </div>
  );
}
