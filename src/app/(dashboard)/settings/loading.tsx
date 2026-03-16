export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5 animate-pulse">
      <div>
        <div className="h-6 w-12 rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
        <div className="h-4 w-40 rounded-lg bg-[var(--apple-tertiary-system-fill)] mt-1.5" />
      </div>
      <div className="glass p-5 space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-16 rounded bg-[var(--apple-tertiary-system-fill)]" />
            <div className="h-10 w-full rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
