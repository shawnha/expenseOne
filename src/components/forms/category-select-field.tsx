"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORY_OPTIONS } from "@/lib/validations/expense-form";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 카테고리 선택 — 프리셋 + 내가 쓰던 것 + 직접 입력
//
// 예전엔 이 블록이 네 군데(법카 작성·입금요청 작성·법카 수정·입금요청 수정)에
// 복사돼 있었다. 같은 UI인데 버튼 크기가 서로 달랐고, 고칠 일이 생기면 네 번
// 고쳐야 했다. 한 곳으로 모은다.
//
// `myCategories`는 본인이 직접 입력해 실제로 제출한 카테고리다(최근순). 이걸
// 버튼으로 띄워주면 "사무용품"을 매번 다시 타이핑할 필요가 없다.
//
// pill 치수는 바로 아래 붙는 호점 선택(BranchSelectField)과 똑같이 맞춘다 —
// 같은 화면에 나란히 서는 같은 종류의 컨트롤이다. 표면도 glass-input을 쓴다:
// glass 카드 안에서 blur를 쓰는 버튼을 십수 개 겹치면 모바일에서 눈에 띄게
// 무거워진다.
// ---------------------------------------------------------------------------

interface CategorySelectFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** 본인이 예전에 직접 입력한 카테고리 (최근순). 서버에서 내려준다. */
  myCategories?: string[];
  error?: string;
  required?: boolean;
}

/** 버튼으로 이미 떠 있는 값인가 — 그러면 입력칸을 열 이유가 없다. */
export function isKnownCategory(value: string, myCategories: string[] = []): boolean {
  return (
    CATEGORY_OPTIONS.some((o) => o.value === value) || myCategories.includes(value)
  );
}

export function CategorySelectField({
  value,
  onChange,
  myCategories = [],
  error,
  required = true,
}: CategorySelectFieldProps) {
  // 수정 화면처럼 값이 이미 있는 경우: 버튼에 없는 값일 때만 입력칸을 연다.
  // 버튼에 있는 값이면 그 버튼이 선택된 상태로 보이는 게 맞다.
  const [showCustom, setShowCustom] = useState(
    () => !!value && !isKnownCategory(value, myCategories),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  // 상태가 아니라 ref다 — 이펙트 안에서 setState를 하면 렌더가 한 번 더 돈다.
  const wantsFocus = useRef(false);

  // "+ 직접 입력"을 **눌렀을 때만** 커서를 넣는다. autoFocus로 하면 (1) 수정
  // 화면에서 입력칸이 처음부터 열려 있을 때 페이지가 열자마자 이 칸으로 튀고,
  // (2) 이미 열려 있는 상태에선 리마운트가 없어 포커스가 아예 안 간다.
  useEffect(() => {
    if (showCustom && wantsFocus.current) {
      wantsFocus.current = false;
      inputRef.current?.focus();
    }
  }, [showCustom]);

  const pill = (active: boolean) =>
    cn(
      "h-11 rounded-full px-4 text-[15px] font-medium transition-colors sm:h-9 sm:text-sm",
      active
        ? "bg-[var(--apple-blue)] text-white"
        : "glass-input text-[var(--apple-label)]",
    );

  const select = (v: string) => {
    onChange(v);
    setShowCustom(false);
  };

  // 프리셋과 글자가 똑같은 버튼이 두 개 뜨면 어느 쪽을 눌러야 하는지 알 수
  // 없다. 서버에서도 걸러내지만 여기서 한 번 더 막는다.
  const presetStrings = new Set(
    CATEGORY_OPTIONS.flatMap((o) => [o.value, o.label]),
  );
  const mine = myCategories.filter((c) => !presetStrings.has(c));

  return (
    <div className="space-y-1.5">
      <Label>
        카테고리 {required && <span className="text-[var(--apple-red)]">*</span>}
      </Label>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="카테고리 선택">
          {CATEGORY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={value === opt.value && !showCustom}
              onClick={() => select(opt.value)}
              className={pill(value === opt.value && !showCustom)}
            >
              {opt.label}
            </button>
          ))}

          {/* 내가 쓰던 카테고리. 없으면 아무것도 안 뜬다 — 기존 화면 그대로. */}
          {mine.map((c) => (
            <button
              key={`my-${c}`}
              type="button"
              title={c}
              aria-pressed={value === c && !showCustom}
              onClick={() => select(c)}
              className={cn(pill(value === c && !showCustom), "max-w-[220px] truncate")}
            >
              {c}
            </button>
          ))}

          <button
            type="button"
            aria-pressed={showCustom}
            onClick={() => {
              // 이미 열려 있으면 **값을 건드리지 않는다**. 이 버튼은 열린 동안
              // 파란 '선택됨'으로 보여서, 다시 누르는 사람이 있다 — 그때마다
              // 타이핑하던 글자가 날아가면 안 된다. 커서만 입력칸으로 보낸다.
              if (showCustom) {
                inputRef.current?.focus();
                return;
              }
              wantsFocus.current = true;
              setShowCustom(true);
              onChange("");
            }}
            className={pill(showCustom)}
          >
            + 직접 입력
          </button>
        </div>

        {showCustom && (
          <Input
            ref={inputRef}
            placeholder="카테고리를 직접 입력하세요"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={!!error}
            aria-label="카테고리 직접 입력"
          />
        )}
      </div>

      {error && <p className="text-xs text-[var(--apple-red)]">{error}</p>}
    </div>
  );
}
