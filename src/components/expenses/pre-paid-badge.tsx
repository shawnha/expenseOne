import { cn } from "@/lib/utils";

// 선지급 칩 — 입금 담당자가 목록에서 선지급 여부를 즉시 알 수 있도록 표시.
// 부분 선지급(percentage < 100)이면 비율까지 함께 보여준다.
export function PrePaidBadge({
  isPrePaid,
  percentage,
  className,
}: {
  isPrePaid?: boolean;
  percentage?: number | null;
  className?: string;
}) {
  if (!isPrePaid) return null;
  const label =
    percentage != null && percentage < 100 ? `선지급 ${percentage}%` : "선지급";
  return (
    <span className={cn("glass-badge glass-badge-purple shrink-0", className)}>
      {label}
    </span>
  );
}
