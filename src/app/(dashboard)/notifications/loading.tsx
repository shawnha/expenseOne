export default function NotificationsLoading() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5 animate-pulse">
      <div>
        <div className="h-6 w-16 rounded-lg bg-[var(--apple-tertiary-system-fill)]" />
        <div className="h-4 w-36 rounded-lg bg-[var(--apple-tertiary-system-fill)] mt-1.5" />
      </div>
      <div className="glass p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-start gap-3 py-3 border-b border-[var(--apple-separator)]">
            <div className="size-8 rounded-full bg-[var(--apple-tertiary-system-fill)] shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-48 rounded bg-[var(--apple-tertiary-system-fill)]" />
              <div className="h-3 w-32 rounded bg-[var(--apple-tertiary-system-fill)]" />
            </div>
            <div className="h-3 w-12 rounded bg-[var(--apple-tertiary-system-fill)]" />
          </div>
        ))}
      </div>
    </div>
  );
}
