export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5 animate-pulse">
      <div>
        <div className="h-6 w-32 rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
        <div className="h-4 w-48 rounded-lg bg-[var(--apple-tertiary-system-fill)] mt-1.5" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-3 sm:p-4 lg:p-5">
            <div className="h-3 w-16 rounded bg-[var(--apple-tertiary-system-fill)] mb-2" />
            <div className="h-7 w-20 rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
          </div>
        ))}
      </div>
      <div className="glass p-3 sm:p-4 lg:p-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between py-3 border-b border-[var(--apple-separator)]">
            <div className="h-4 w-40 rounded bg-[var(--apple-tertiary-system-fill)]" />
            <div className="h-4 w-20 rounded bg-[var(--apple-tertiary-system-fill)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
