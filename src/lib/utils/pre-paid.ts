// ---------------------------------------------------------------------------
// 부분 선지급 나누기 — 선지급금/후지급금 계산은 **여기 한 곳**에서만 한다.
//
// 예전엔 상세·승인 확인·승인 대기·Slack·후지급 요청/승인 라우트가 저마다
// `Math.round(amount * pct / 100)` 을 따로 적었다(9곳). 선지급을 금액으로도 정할 수 있게
// 되면서(0028 expense_pre_paid_amounts) 한 곳이라도 비율로 계산하면 그 화면만 다른 금액을
// 보여 준다 — 승인은 곧 송금이라 그대로 잘못 송금된다.
//
// 규칙
// - 금액으로 정했으면(prePaidFixedAmount) 그 금액이 이긴다. pre_paid_percentage 는 그때
//   ERP·필터·칩이 "부분 선지급"으로 알아보라고 적어 둔 환산 비율일 뿐 계산에 쓰지 않는다.
// - 잔금 = 총액 − 선지급금. 양쪽을 따로 반올림하면 합이 총액과 어긋난다.
// - USD(HOI)는 amountOriginal 이 센트 정수라 같은 방식으로 나눈다. 금액 입력은 원화 건만 받는다.
// ---------------------------------------------------------------------------

export interface PrePaidFields {
  /** 저장된 원화 금액(실지급액). */
  amount: number;
  /** USD 건의 원문 금액(센트). */
  amountOriginal?: number | null;
  isPrePaid?: boolean | null;
  prePaidPercentage?: number | null;
  /** 금액으로 정한 선지급금(원). 비율로 정한 건은 null. */
  prePaidFixedAmount?: number | null;
}

export interface PrePaidSplit {
  prePaidAmount: number;
  remainingAmount: number;
  prePaidOriginal: number | null;
  remainingOriginal: number | null;
  /** 금액으로 정한 건인지. 이때는 비율을 "정확한 값"처럼 보여 주지 않는다. */
  byAmount: boolean;
  /** 비율로 정한 건의 비율(%). 금액으로 정한 건은 null. */
  percentage: number | null;
}

/** 금액으로 정한 선지급금이 쓸 수 있는 값인지 — 0 < x < 총액. */
function validFixed(amount: number, fixed: number | null | undefined): fixed is number {
  return fixed != null && Number.isInteger(fixed) && fixed > 0 && fixed < amount;
}

/**
 * 부분 선지급(잔금이 남는 건)인지. PrePaidBadge·「잔금만」 필터와 같은 규칙:
 * isPrePaid 이고 비율이 있고 100 미만. 금액으로 정한 건도 환산 비율(1~99)이 같이 적혀 있다.
 */
export function isPartialPrePaid(e: Pick<PrePaidFields, "isPrePaid" | "prePaidPercentage">): boolean {
  return e.isPrePaid === true && e.prePaidPercentage != null && e.prePaidPercentage < 100;
}

/** 선지급금/후지급금. 부분 선지급이 아니면 null. */
export function prePaidSplit(e: PrePaidFields): PrePaidSplit | null {
  if (!isPartialPrePaid(e)) return null;
  const pct = e.prePaidPercentage!;
  const byAmount = validFixed(e.amount, e.prePaidFixedAmount);

  const prePaidAmount = byAmount ? e.prePaidFixedAmount! : Math.round((e.amount * pct) / 100);
  const remainingAmount = e.amount - prePaidAmount;

  let prePaidOriginal: number | null = null;
  let remainingOriginal: number | null = null;
  if (e.amountOriginal != null) {
    prePaidOriginal = byAmount
      ? Math.round((e.amountOriginal * prePaidAmount) / e.amount)
      : Math.round((e.amountOriginal * pct) / 100);
    remainingOriginal = e.amountOriginal - prePaidOriginal;
  }

  return {
    prePaidAmount,
    remainingAmount,
    prePaidOriginal,
    remainingOriginal,
    byAmount,
    percentage: byAmount ? null : pct,
  };
}

/**
 * 금액으로 정한 선지급을 pre_paid_percentage 에 적을 환산 비율. 1~99 로 묶는다 —
 * 0 이나 100 이 되면(총액 1억에 선지급 1천 원 등) "부분 선지급"으로 안 보여 잔금이 사라진다.
 */
export function percentageForAmount(prePaidAmount: number, total: number): number {
  if (!(total > 0)) return 1;
  return Math.min(99, Math.max(1, Math.round((prePaidAmount / total) * 100)));
}

/** 칩·Slack 한 줄용. "50%" / "3,000,000원". */
export function prePaidShareText(split: PrePaidSplit): string {
  return split.byAmount
    ? `${split.prePaidAmount.toLocaleString("ko-KR")}원`
    : `${split.percentage}%`;
}

// ---------------------------------------------------------------------------
// 저장 계획 — 등록·수정 때 "금액 지정" 표(expense_pre_paid_amounts)와 비율 칸을 어떻게 맞출지.
// 서버(expense.service)만 쓰지만 경우가 많아 DB 없이 테스트하려고 여기 둔다.
// ---------------------------------------------------------------------------

export type PrePaidFixedWrite = "none" | "delete" | { amount: number };

export type PrePaidFixedPlan =
  | {
      ok: true;
      /** 표에 할 일. */
      write: PrePaidFixedWrite;
      /** 금액 지정이 남으면 pre_paid_percentage 에 적을 환산 비율. 아니면 undefined(입력 그대로). */
      prePaidPercentage?: number;
    }
  | { ok: false; message: string };

interface PlanCurrent {
  amount: number;
  currency: string;
  isPrePaid: boolean;
  prePaidPercentage: number | null;
  prePaidFixedAmount: number | null;
}

interface PlanInput {
  amount?: number;
  isPrePaid?: boolean;
  prePaidPercentage?: number | null;
  /** undefined = 안 보냄(그대로), null = 금액 지정 해제. */
  prePaidFixedAmount?: number | null;
}

function checkFixed(fixed: number, amount: number, currency: string): string | null {
  if (currency !== "KRW") return "선지급 금액 지정은 원화 건만 됩니다. 비율로 입력해주세요.";
  if (!(fixed < amount)) return "선지급 금액은 총 금액보다 작아야 합니다.";
  return null;
}

/** 등록. 이미 원화 환산·원천징수가 끝난 최종 amount 를 넘긴다. */
export function planPrePaidFixedCreate(input: {
  amount: number;
  currency: string;
  isPrePaid: boolean;
  prePaidFixedAmount?: number | null;
}): PrePaidFixedPlan {
  const fixed = input.prePaidFixedAmount ?? null;
  if (fixed == null) return { ok: true, write: "none" };
  if (!input.isPrePaid) return { ok: false, message: "선지급이 아닌 건에는 선지급 금액을 넣을 수 없습니다." };
  const err = checkFixed(fixed, input.amount, input.currency);
  if (err) return { ok: false, message: err };
  return { ok: true, write: { amount: fixed }, prePaidPercentage: percentageForAmount(fixed, input.amount) };
}

/**
 * 수정. 금액 지정은 다음 경우에 풀린다(표에서 지움 → 비율로 계산):
 * - prePaidFixedAmount: null 을 보냄
 * - 선지급을 끔(isPrePaid=false)
 * - 금액 지정 키 없이 비율을 **다른 값으로** 보냄 — 옛 화면(배포 전 캐시)이 비율만 보내는 경우.
 *   같은 값(지금 적힌 환산 비율)이면 제목만 고친 저장일 수 있으니 금액 지정을 그대로 둔다.
 * 금액 지정이 남으면 총액(바뀐 금액 포함)보다 작은지 다시 보고, 환산 비율을 새로 적는다.
 */
export function planPrePaidFixedUpdate(current: PlanCurrent, input: PlanInput): PrePaidFixedPlan {
  const amount = input.amount ?? current.amount;
  const isPrePaid = input.isPrePaid ?? current.isPrePaid;

  let fixed: number | null;
  if (input.prePaidFixedAmount !== undefined) {
    fixed = input.prePaidFixedAmount;
  } else if (
    input.prePaidPercentage !== undefined &&
    (input.prePaidPercentage ?? null) !== (current.prePaidPercentage ?? null)
  ) {
    fixed = null;
  } else {
    fixed = current.prePaidFixedAmount;
  }
  if (!isPrePaid) {
    if (input.prePaidFixedAmount != null) {
      return { ok: false, message: "선지급이 아닌 건에는 선지급 금액을 넣을 수 없습니다." };
    }
    fixed = null;
  }

  if (fixed == null) {
    return { ok: true, write: current.prePaidFixedAmount != null ? "delete" : "none" };
  }
  const err = checkFixed(fixed, amount, current.currency);
  if (err) return { ok: false, message: err };
  return {
    ok: true,
    write: fixed === current.prePaidFixedAmount ? "none" : { amount: fixed },
    prePaidPercentage: percentageForAmount(fixed, amount),
  };
}
