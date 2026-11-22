"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Focus, PlayCircle, Search } from "lucide-react";
import { loadPlansFlag } from "@/components/plans/plans-nav-gate";
import { OPEN_MENU_TOUR_EVENT, OPEN_TOUR_EVENT } from "@/components/layout/tab-menu-items";
import { HelpUsageSummary } from "./help-usage-summary";
import { filterHelpSections, type HelpSection } from "@/lib/help/content";

function Section({ section, query }: { section: HelpSection; query: string }) {
  const searching = query.trim().length > 0;
  return (
    <section id={section.id} className="glass-card scroll-mt-20 p-4 sm:p-5" aria-labelledby={`${section.id}-title`}>
      <h2 id={`${section.id}-title`} className="mb-2 text-[17px] font-semibold text-[var(--apple-label)]">
        {section.title}
      </h2>
      <div className="divide-y divide-[var(--apple-separator)]">
        {section.items.map((item) => (
          // 검색 중에는 찾은 답을 바로 펼쳐 둔다. key 를 바꿔 검색을 지우면 다시 접힌다.
          <details key={`${item.q}-${searching}`} open={searching} className="group py-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-[15px] font-medium text-[var(--apple-label)] [&::-webkit-details-marker]:hidden">
              <span>{item.q}</span>
              <ChevronDown className="size-4 shrink-0 text-[var(--apple-tertiary-label)] transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-1.5 pb-3 text-[14px] leading-relaxed text-[var(--apple-secondary-label)]">
              {item.a.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export function HelpView({ sections, isAdmin = false }: { sections: HelpSection[]; isAdmin?: boolean }) {
  const [query, setQuery] = useState("");
  // 비용계획 섹션은 계획 스위치가 켜진 사람에게만. 모르면 숨긴다(메뉴 게이트와 같은 판단·같은 캐시).
  const [plansOn, setPlansOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadPlansFlag().then((on) => alive && setPlansOn(on));
    return () => {
      alive = false;
    };
  }, []);
  const visible = sections.filter((s) => !s.plansOnly || plansOn);
  const shown = filterHelpSections(visible, query);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="animate-fade-up">
        <h1 className="text-lg font-semibold text-[var(--apple-label)] sm:text-xl">사용법</h1>
        <p className="text-sm text-[var(--apple-secondary-label)]">궁금한 것을 누르면 답이 펼쳐져요.</p>
      </div>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_MENU_TOUR_EVENT))}
        className="glass-card flex min-h-14 items-center gap-3 px-4 py-3 text-left apple-press"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--apple-blue)]/12 text-[var(--apple-blue)]">
          <Focus className="size-[18px]" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[var(--apple-label)]">메뉴 안내 다시 보기</span>
          <span className="block text-xs text-[var(--apple-secondary-label)]">실제 화면에서 제출·비용·알림·사용법 위치를 확인해요.</span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_TOUR_EVENT))}
        className="glass-card flex min-h-14 items-center gap-3 px-4 py-3 text-left apple-press"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--apple-blue)]/12 text-[var(--apple-blue)]">
          <PlayCircle className="size-[18px]" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[var(--apple-label)]">1분 안내 다시 보기</span>
          <span className="block text-[12px] text-[var(--apple-secondary-label)]">그림으로 보는 주요 기능</span>
        </span>
      </button>

      <label className="glass-card flex h-11 items-center gap-2 px-4">
        <Search className="size-4 shrink-0 text-[var(--apple-tertiary-label)]" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="찾기 (예: 후지급, 카드 등록, 취소)"
          aria-label="사용법에서 찾기"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--apple-label)] outline-none placeholder:text-[var(--apple-tertiary-label)]"
        />
      </label>

      {query.trim() === "" && (
        <nav aria-label="사용법 목차" className="flex flex-wrap gap-1.5">
          {visible.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="inline-flex h-8 items-center rounded-full bg-[var(--apple-tertiary-system-fill)] px-3 text-[13px] font-medium text-[var(--apple-label)] apple-press"
            >
              {s.title}
            </a>
          ))}
        </nav>
      )}

      {shown.length === 0 ? (
        <p className="glass-card p-6 text-center text-sm text-[var(--apple-secondary-label)]">
          찾는 내용이 없어요. 관리자에게 물어봐 주세요.
        </p>
      ) : (
        shown.map((s) => <Section key={s.id} section={s} query={query} />)
      )}
      {isAdmin && <HelpUsageSummary />}
    </div>
  );
}
