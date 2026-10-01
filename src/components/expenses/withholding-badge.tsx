import { cn } from "@/lib/utils";

// 원천징수(3.3%) 칩 — 제출자가 「프리랜서 원천징수 3.3%」를 체크한 건(2026-10-01 오너: "체크한 건지 안 한 건지 헷갈린다").
// 체크하면 금액이 이미 3.3% 를 뺀 실지급액이라, 입금 담당자가 목록에서 바로 알아야 한다. 안 했으면 그리지 않는다
// (상세·승인 확인·Slack 은 「공제 안 함」까지 적는다 — 목록은 칩이 없는 것이 곧 안 함).
export function WithholdingBadge({
  applied,
  className,
}: {
  applied?: boolean;
  className?: string;
}) {
  if (!applied) return null;
  return <span className={cn("glass-badge glass-badge-orange shrink-0", className)}>3.3% 공제</span>;
}
