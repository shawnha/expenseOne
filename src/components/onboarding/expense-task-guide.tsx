"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronDown } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

const GUIDES = {
  card: {
    link: "/expenses/new/corporate-card?guide=1",
    label: "법카 등록 안내",
    steps: [
      { title: "결제 정보 확인", detail: "결제 알림에서 들어왔다면 채워진 금액과 가맹점을 확인해요. 직접 작성한다면 결제 정보를 입력해요." },
      { title: "제목과 카테고리 입력", detail: "어디에 쓴 비용인지 제목에 적고, 회사와 카테고리가 맞는지 확인해요." },
      { title: "작성 내용 확인", detail: "금액과 결제 내용을 확인해요. 실제 비용을 올릴 때만 작성 화면의 ‘제출하기’를 눌러요." },
    ],
  },
  deposit: {
    link: "/expenses/new/deposit-request?guide=1",
    label: "입금요청 안내",
    steps: [
      { title: "증빙 서류 첨부", detail: "견적서나 청구서 등 증빙을 1개 이상 올리고, 파일마다 종류를 골라요." },
      { title: "금액과 계좌 확인", detail: "증빙에서 자동으로 채운 값이 맞는지 확인하고, 예금주와 계좌번호를 대조해요." },
      { title: "요청 내용 확인", detail: "최종 금액과 받을 계좌를 확인해요. 실제 요청을 올릴 때는 ‘제출하기’에서 요약을 검토한 뒤 제출해요." },
    ],
  },
} as const;

type GuideKind = keyof typeof GUIDES;
const storageKey = (userId: string, section: string) => `expenseone.task-guide.v1.${userId}.${section}`;

function readGuideStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function saveGuideStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* 안내는 저장 없이도 사용할 수 있다. */ }
}

export function ExpenseGuideStart({ userId }: { userId: string }) {
  const key = storageKey(userId, "start-dismissed");
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(readGuideStorage(key) !== "1");
  }, [key]);

  if (!visible) return null;

  return (
    <section aria-label="시작하기" className="rounded-2xl border border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <h2 className="flex items-center gap-2 text-subheadline font-semibold text-[var(--apple-label)]">
          <BookOpen className="size-4 text-[var(--apple-blue)]" aria-hidden="true" />
          처음 비용을 올리시나요?
        </h2>
        <Button type="button" variant="ghost" size="lg" className="text-[var(--apple-secondary-label)]" onClick={() => {
          saveGuideStorage(key, "1");
          setVisible(false);
        }}>
          나중에 보기
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.values(GUIDES).map(({ link, label }) => (
          <Link key={link} href={link} className={buttonVariants({ variant: "outline", size: "lg" })}>
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}

export function ExpenseTaskGuide({ kind, userId, startsOpen = false }: {
  kind: GuideKind;
  userId: string;
  startsOpen?: boolean;
}) {
  const { label, steps } = GUIDES[kind];
  const key = storageKey(userId, kind);
  const contentId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(startsOpen);
  const [checked, setChecked] = useState<string | null>(null);

  useEffect(() => {
    const saved = readGuideStorage(key);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 계정별 진행 상태를 브라우저에서 복원한다.
    setChecked(saved && /^[01]{3}$/.test(saved) ? saved : "000");
  }, [key]);

  function update(next: string) {
    setChecked(next);
    saveGuideStorage(key, next);
  }

  const count = checked?.split("").filter((value) => value === "1").length ?? 0;
  const done = count === steps.length;

  return (
    <section aria-label={label} className="rounded-2xl border border-[var(--apple-separator)] bg-[var(--apple-secondary-system-background)]">
      <Button
        ref={toggleRef}
        type="button"
        variant="ghost"
        className="h-auto min-h-11 w-full justify-between gap-2 whitespace-normal rounded-2xl px-4 py-2 text-left"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(!open)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <BookOpen className="size-4 text-[var(--apple-blue)]" aria-hidden="true" />
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-footnote tabular-nums text-[var(--apple-secondary-label)]">
          {done ? "확인 완료" : `${count}/${steps.length}`}
          <ChevronDown className={open ? "size-4 rotate-180" : "size-4"} aria-hidden="true" />
        </span>
      </Button>
      <div id={contentId} hidden={!open} className="space-y-3 px-4 pb-3 pt-1">
        {checked !== null && (
          <>
            <div
              role="progressbar"
              aria-label="안내 확인 단계"
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-valuenow={count}
              aria-valuetext={`${steps.length}단계 중 ${count}단계 확인`}
              className="h-1.5 overflow-hidden rounded-full bg-[var(--apple-tertiary-system-fill)]"
            >
              <div className="h-full rounded-full bg-[var(--apple-blue)] motion-safe:transition-[width] motion-safe:duration-200" style={{ width: `${count / steps.length * 100}%` }} />
            </div>
            <ol className="divide-y divide-[var(--apple-separator)]">
              {steps.map(({ title, detail }, index) => {
                const stepId = `${contentId}-step-${index}`;
                return (
                  <li key={title}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-3">
                      <input
                        type="checkbox"
                        aria-labelledby={`${stepId}-title`}
                        aria-describedby={`${stepId}-detail`}
                        checked={checked[index] === "1"}
                        onChange={(event) => update(checked.slice(0, index) + (event.target.checked ? "1" : "0") + checked.slice(index + 1))}
                        className="mt-0.5 size-4 shrink-0 accent-[var(--apple-blue)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--apple-blue)]"
                      />
                      <span className="min-w-0">
                        <span id={`${stepId}-title`} className="block text-sm font-semibold text-[var(--apple-label)]">{title}</span>
                        <span id={`${stepId}-detail`} className="mt-0.5 block break-keep text-footnote leading-relaxed text-[var(--apple-secondary-label)]">{detail}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {done && <Button type="button" variant="ghost" size="lg" onClick={() => {
                update("000");
                toggleRef.current?.focus();
              }}>처음부터 보기</Button>}
              <Button type="button" variant="outline" size="lg" onClick={() => {
                setOpen(false);
                toggleRef.current?.focus();
              }}>{done ? "안내 닫기" : "접기"}</Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
