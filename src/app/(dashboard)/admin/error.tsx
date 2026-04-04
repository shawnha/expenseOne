"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-4">
      <p className="text-[var(--apple-red)] text-sm font-medium">
        데이터를 불러오는 중 오류가 발생했습니다
      </p>
      <p className="text-xs text-[var(--apple-secondary-label)] max-w-sm">
        {error.message}
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm font-medium text-white bg-[var(--apple-blue)] rounded-full"
      >
        다시 시도
      </button>
    </div>
  );
}
