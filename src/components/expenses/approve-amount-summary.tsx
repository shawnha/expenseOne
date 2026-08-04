import { formatExpenseAmount } from "@/lib/utils/expense-utils";

interface ApproveAmountSummaryProps {
  amount: number;
  currency?: string | null;
  amountOriginal?: number | null;
  isPrePaid?: boolean;
  prePaidPercentage?: number | null;
}

/**
 * 승인 확인 다이얼로그의 금액 안내.
 *
 * 승인은 곧 송금이라 이 화면이 돈이 나가기 직전 마지막 확인 지점이다.
 * 부분 선지급 건에 총액을 띄우면 그 금액대로 전액 송금하는 사고가 나므로
 * "이번에 나갈 금액"을 굵게 앞세우고 총액은 아래 줄로 내린다.
 *
 * 비용 상세와 승인 대기 목록 두 곳에서 쓰인다 — 한쪽만 고쳐 문구가 갈리지
 * 않도록 공용 컴포넌트로 둔다.
 */
export function ApproveAmountSummary({
  amount,
  currency,
  amountOriginal,
  isPrePaid,
  prePaidPercentage,
}: ApproveAmountSummaryProps) {
  const isPartialPrePaid =
    isPrePaid === true && prePaidPercentage != null && prePaidPercentage < 100;

  if (!isPartialPrePaid) {
    return <>금액: {formatExpenseAmount(amount, currency, amountOriginal)}</>;
  }

  // 잔금은 총액에서 빼서 구한다. 양쪽을 따로 반올림하면 합이 총액과 어긋난다.
  const prePaidAmount = Math.round((amount * prePaidPercentage!) / 100);
  const remainingAmount = amount - prePaidAmount;

  // USD 건(HOI)은 "$X (₩Y)"로 표시된다. 원화만 쪼개면 이번 지급액은 원화,
  // 총액은 달러 기준이 되어 서로 비교가 안 되므로 원문 금액도 같은 비율로 쪼갠다.
  // amountOriginal은 센트 정수라 원화와 똑같이 반올림 후 차감해야 합이 맞는다.
  const prePaidOriginal =
    amountOriginal != null
      ? Math.round((amountOriginal * prePaidPercentage!) / 100)
      : null;
  const remainingOriginal =
    amountOriginal != null && prePaidOriginal != null
      ? amountOriginal - prePaidOriginal
      : null;

  return (
    <>
      <span className="font-semibold text-[var(--apple-label)]">
        이번 지급액: {formatExpenseAmount(prePaidAmount, currency, prePaidOriginal)}{" "}
        (선지급 {prePaidPercentage}%)
      </span>
      <br />총 {formatExpenseAmount(amount, currency, amountOriginal)} · 후지급{" "}
      {formatExpenseAmount(remainingAmount, currency, remainingOriginal)} 예정
    </>
  );
}
