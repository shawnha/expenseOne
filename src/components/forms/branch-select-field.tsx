"use client";

import { BRANCH_OPTIONS } from "@/lib/validations/expense-form";

// ---------------------------------------------------------------------------
// 호점 선택 (1호점 / 2호점)
//
// **리테일의 마트/약국 실비일 때만** 뜬다. 다른 법인·다른 카테고리에는 호점
// 개념이 없어서, 항상 띄우면 대부분의 사람에게 의미 없는 칸이 하나 늘어난다.
//
// 지금까지는 관리자가 /admin/mart-pharmacy에서 **사후에** 지정했다. 그런데
// 시간이 지나면 어느 점에서 썼는지 알기 어렵다 — 쓴 사람이 제출할 때 고르는
// 게 정확하다. 관리자 지정은 그대로 두고(고칠 수 있어야 하니까) 입력 시점을
// 앞당기는 것이다.
// ---------------------------------------------------------------------------

/** 호점을 물어볼 조건. 회사 slug와 카테고리가 둘 다 맞아야 한다. */
export function shouldAskBranch(
  companySlug: string | null | undefined,
  category: string | null | undefined,
): boolean {
  return companySlug === "retail" && category === "MART_PHARMACY";
}

export function BranchSelectField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-[13px] text-[var(--apple-secondary-label)]">
        호점 <span className="text-[var(--apple-tertiary-label)]">(마트/약국 정산 구분)</span>
      </span>
      <div className="flex flex-wrap gap-2">
        {BRANCH_OPTIONS.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(active ? null : o.value)}
              className={`h-11 min-w-[92px] rounded-full px-4 text-[15px] transition-colors sm:h-9 sm:text-sm ${
                active
                  ? "bg-[var(--apple-blue)] text-white"
                  : "glass-input text-[var(--apple-label)]"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[12px] text-[var(--apple-tertiary-label)]">
        선택하지 않으면 미지정으로 남고, 관리자가 나중에 지정할 수 있습니다.
      </p>
    </div>
  );
}
