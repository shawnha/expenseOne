export default function PlanDetailLoading() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5 animate-pulse">
      <div className="h-6 w-24 rounded-full bg-[var(--apple-tertiary-system-fill)]" />

      {/* 머리 + 요약 */}
      <div className="glass rounded-2xl p-4 sm:p-5">
        <div className="h-4 w-40 rounded bg-[var(--apple-tertiary-system-fill)]" />
        <div className="mt-2 h-6 w-2/3 rounded bg-[var(--apple-tertiary-system-fill)]" />
        <div className="mt-2 h-4 w-32 rounded bg-[var(--apple-tertiary-system-fill)]" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((tile) => (
            <div key={tile} className="h-14 rounded-xl bg-[var(--apple-tertiary-system-fill)]" />
          ))}
        </div>
      </div>

      {/* 필드 */}
      <div className="glass rounded-2xl p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((field) => (
            <div key={field}>
              <div className="h-3 w-16 rounded bg-[var(--apple-tertiary-system-fill)]" />
              <div className="mt-1.5 h-4 w-28 rounded bg-[var(--apple-tertiary-system-fill)]" />
            </div>
          ))}
        </div>
      </div>

      {/* 연결 · 메모 */}
      {[0, 1].map((block) => (
        <div key={block} className="glass rounded-2xl p-4 sm:p-5">
          <div className="h-5 w-32 rounded bg-[var(--apple-tertiary-system-fill)]" />
          <div className="mt-3 h-14 rounded-xl bg-[var(--apple-tertiary-system-fill)]" />
        </div>
      ))}
    </div>
  );
}
