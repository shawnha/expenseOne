import { cn } from "@/lib/utils";

// 선지급 칩 — 입금 담당자가 목록에서 선지급 여부를 즉시 알 수 있도록 표시.
// 부분 선지급(percentage < 100)이면 비율까지 함께 보여준다.
// 금액으로 정한 건(fixedAmount)은 비율 대신 금액 — 그때 percentage 는 환산 비율이라 정확한 값이 아니다.
export function PrePaidBadge({
  isPrePaid,
  percentage,
  fixedAmount,
  className,
}: {
  isPrePaid?: boolean;
  percentage?: number | null;
  fixedAmount?: number | null;
  className?: string;
}) {
  if (!isPrePaid) return null;
  const partial = percentage != null && percentage < 100;
  const label = !partial
    ? "선지급"
    : fixedAmount != null
      ? `선지급 ${fixedAmount.toLocaleString("ko-KR")}원`
      : `선지급 ${percentage}%`;
  return (
    <span className={cn("glass-badge glass-badge-purple shrink-0", className)}>
      {label}
    </span>
  );
}
