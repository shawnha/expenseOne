export default function ExpensesLoading() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5 animate-pulse">
      {/* Header skeleton */}
      <div>
        <div className="h-6 w-24 rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
        <div className="h-4 w-40 rounded-lg bg-[var(--apple-tertiary-system-fill)] mt-1.5" />
      </div>

      {/* Filter bar skeleton */}
      <div className="glass p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          <div className="h-9 w-28 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
          <div className="h-9 w-28 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
          <div className="h-9 w-36 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="glass p-3 sm:p-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center justify-between py-3 border-b border-[var(--apple-separator)]">
            <div className="space-y-1.5 flex-1">
              <div className="h-4 w-40 rounded bg-[var(--apple-tertiary-system-fill)]" />
              <div className="h-3 w-24 rounded bg-[var(--apple-tertiary-system-fill)]" />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-5 w-20 rounded bg-[var(--apple-tertiary-system-fill)]" />
              <div className="h-5 w-12 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
