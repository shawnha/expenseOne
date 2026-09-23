"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PlansNavGate, PlansNavIcon } from "./plans-nav-gate";

// ---------------------------------------------------------------------------
// "비용계획" 바로가기 한 줄.
//
// 모바일에는 사이드바가 없고 탭 5칸도 차 있어서, 계획은 탭 바 빠른 메뉴(설정 탭 길게 누르기)에만
// 있었다 — 눌러 볼 생각을 못 하면 못 찾는다(오너 제보 9/23). 홈과 설정에 보이는 줄을 하나씩 둔다.
// 스위치가 꺼진 사람에게는 아무것도 그리지 않는다(PlansNavGate).
// ---------------------------------------------------------------------------

export function PlansEntryLink({ subtitle = "앞으로 나갈 돈을 달별로 세워 두고, 실제 입금요청과 맞춰 봅니다." }: { subtitle?: string }) {
  return (
    <PlansNavGate>
      <Link
        href="/plans"
        className="glass-card flex min-h-14 items-center gap-3 px-4 py-3 apple-press animate-fade-up-2"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--apple-blue)]/12 text-[var(--apple-blue)]">
          <PlansNavIcon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[var(--apple-label)]">비용계획</span>
          <span className="block truncate text-[12px] text-[var(--apple-secondary-label)]">{subtitle}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-[var(--apple-tertiary-label)]" aria-hidden="true" />
      </Link>
    </PlansNavGate>
  );
}
