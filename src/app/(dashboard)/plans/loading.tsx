export default function PlansLoading() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6 animate-pulse">
      {/* 머리 */}
      {/* 실제 머리(page.tsx)와 같은 flex-wrap. 빼면 375px 화면에서 오른쪽 버튼 자리가 잘린다
          (고정 폭 합계 452px > main 343px, main 은 overflow-x-hidden 이라 스크롤도 안 된다). */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="h-6 w-28 rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
          <div className="mt-1.5 h-4 w-40 rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
        </div>
        <div className="flex gap-2">
          <div className="h-11 w-24 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
          <div className="h-11 w-28 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
        </div>
      </div>

      {/* 달 이동 + 필터 */}
      <div className="glass p-3 sm:p-4">
        <div className="flex items-center justify-between">
          <div className="size-11 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
          <div className="h-5 w-48 rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
          <div className="size-11 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--apple-separator)] pt-3">
          <div className="h-8 w-32 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
          <div className="h-8 w-28 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
        </div>
      </div>

      {/* 달 4개 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((month) => (
          <div key={month} className="flex flex-col gap-2.5">
            <div className="glass-subtle flex items-center justify-between px-4 py-3">
              <div className="h-5 w-20 rounded bg-[var(--apple-tertiary-system-fill)]" />
              <div className="h-5 w-24 rounded bg-[var(--apple-tertiary-system-fill)]" />
            </div>
            {[0, 1].map((card) => (
              <div key={card} className="glass-card p-4">
                <div className="h-4 w-3/4 rounded bg-[var(--apple-tertiary-system-fill)]" />
                <div className="mt-2 h-3 w-1/2 rounded bg-[var(--apple-tertiary-system-fill)]" />
                <div className="mt-3 h-4 w-20 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
