export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6 animate-pulse">
      {/* Page header skeleton */}
      <div>
        <div className="h-6 w-24 rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
        <div className="h-4 w-48 rounded-lg bg-[var(--apple-tertiary-system-fill)] mt-1.5" />
      </div>

      {/* Summary cards skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-3 sm:p-4 lg:p-5">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <div className="size-7 sm:size-8 rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
              <div className="h-3 w-16 rounded bg-[var(--apple-tertiary-system-fill)]" />
            </div>
            <div className="h-7 w-24 rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
          </div>
        ))}
      </div>

      {/* Tab + list skeleton */}
      <div className="glass p-4">
        <div className="flex gap-2 mb-4">
          <div className="h-8 w-20 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
          <div className="h-8 w-20 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
          <div className="h-8 w-20 rounded-full bg-[var(--apple-tertiary-system-fill)]" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center justify-between py-3 border-b border-[var(--apple-separator)]">
            <div className="space-y-1.5">
              <div className="h-4 w-32 rounded bg-[var(--apple-tertiary-system-fill)]" />
              <div className="h-3 w-20 rounded bg-[var(--apple-tertiary-system-fill)]" />
            </div>
            <div className="h-5 w-20 rounded bg-[var(--apple-tertiary-system-fill)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
