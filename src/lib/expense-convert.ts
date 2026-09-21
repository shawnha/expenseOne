/**
 * 입금요청 → 법카 사용 변경 자격 — 순수 함수 모듈
 *
 * 계좌 입금을 요청했다가 실제로는 법인카드로 결제한 경우가 있다. 취소하고 다시
 * 등록하면 첨부·설명이 날아가고 관리자 알림도 두 번 나가므로, 제출 상태의
 * 입금요청을 그 자리에서 법카 사용으로 바꾼다. 법카 사용은 승인이 필요 없어서
 * 바꾸는 순간 APPROVED가 된다 — 그래서 승인 판단이 이미 끝난 건, 지급 흐름이
 * 얽힌 건, 다른 기록이 이 건을 가리키는 건은 막는다.
 *
 * 서버(expense-convert.service)와 화면(수정 폼 버튼)이 같은 규칙을 봐야 하고
 * 단위 테스트도 따로 돌려야 해서 DB·Next는 import하지 않는다.
 */

// ---------------------------------------------------------------------------
// 판단에 필요한 값. DB 행(expenses.$inferSelect)을 그대로 넘기면 된다.
// ---------------------------------------------------------------------------

export interface ConvertibleExpense {
  type: string;
  status: string;
  submittedById: string;
  isPurchase: boolean;
  remainingPaymentRequested: boolean;
  remainingPaymentApproved: boolean;
}

export interface ConvertViewer {
  id: string;
  role: "MEMBER" | "ADMIN";
}

/**
 * 거부 코드. FORBIDDEN(403)은 권한, CONFLICT(409)는 지금 상태로는 안 되는 경우다.
 * 기존 AppError에는 CONFLICT가 없어서(비용계획 PlanError와 같은 사정) 여기서 따로 둔다.
 */
export type ConvertErrorCode = "FORBIDDEN" | "CONFLICT";

export type ConvertCheck =
  | { ok: true }
  | { ok: false; code: ConvertErrorCode; reason: string };

export const CONVERT_REASONS = {
  notDeposit: "입금요청만 법카 사용으로 변경할 수 있습니다.",
  notOwner: "본인이 제출한 입금요청만 변경할 수 있습니다.",
  approved: "승인된 입금요청은 관리자가 승인을 취소한 뒤에 변경할 수 있습니다.",
  rejected: "반려된 입금요청은 변경할 수 없습니다.",
  cancelled: "취소된 입금요청은 변경할 수 없습니다.",
  purchase: "사입 건은 법카 사용으로 변경할 수 없습니다. 사입을 해제한 뒤 다시 시도해주세요.",
  remainingPayment: "후지급이 요청되거나 승인된 입금요청은 변경할 수 없습니다.",
  hasChildren: "반품이 연결된 입금요청은 변경할 수 없습니다.",
  planLinked: "비용계획에 연결된 요청은 연결을 해제한 뒤 변경할 수 있습니다.",
} as const;

// ---------------------------------------------------------------------------
// 자격 판단
// ---------------------------------------------------------------------------

/**
 * 바꿀 수 있는가. 순서가 곧 사용자에게 보이는 이유의 우선순위다 —
 * 권한이 없으면 상태를 알려주지 않고, 상태가 아니면 부수 조건은 보지 않는다.
 *
 * @param hasActiveLinks 비용계획 활성 연결(plan_expense_links, unlinked_at IS NULL)이 있는가
 * @param hasChildren    이 건을 원거래로 가리키는 반품(REFUND) 행이 있는가
 */
export function assertConvertible(
  expense: ConvertibleExpense,
  viewer: ConvertViewer,
  hasActiveLinks: boolean,
  hasChildren: boolean,
): ConvertCheck {
  if (expense.type !== "DEPOSIT_REQUEST") {
    return { ok: false, code: "CONFLICT", reason: CONVERT_REASONS.notDeposit };
  }
  if (viewer.role !== "ADMIN" && expense.submittedById !== viewer.id) {
    return { ok: false, code: "FORBIDDEN", reason: CONVERT_REASONS.notOwner };
  }
  if (expense.status === "APPROVED") {
    return { ok: false, code: "CONFLICT", reason: CONVERT_REASONS.approved };
  }
  if (expense.status === "REJECTED") {
    return { ok: false, code: "CONFLICT", reason: CONVERT_REASONS.rejected };
  }
  if (expense.status !== "SUBMITTED") {
    return { ok: false, code: "CONFLICT", reason: CONVERT_REASONS.cancelled };
  }
  if (expense.isPurchase) {
    return { ok: false, code: "CONFLICT", reason: CONVERT_REASONS.purchase };
  }
  if (expense.remainingPaymentRequested || expense.remainingPaymentApproved) {
    return { ok: false, code: "CONFLICT", reason: CONVERT_REASONS.remainingPayment };
  }
  if (hasChildren) {
    return { ok: false, code: "CONFLICT", reason: CONVERT_REASONS.hasChildren };
  }
  if (hasActiveLinks) {
    return { ok: false, code: "CONFLICT", reason: CONVERT_REASONS.planLinked };
  }
  return { ok: true };
}

/**
 * 화면에서 버튼을 보여줄지. 행만 보고 알 수 있는 조건만 본다(연결·반품은 서버가 본다).
 * 수정 화면은 본인 것만 열리므로 권한은 여기서 다시 보지 않는다.
 */
export function canShowConvertButton(
  expense: Pick<
    ConvertibleExpense,
    "type" | "status" | "isPurchase" | "remainingPaymentRequested" | "remainingPaymentApproved"
  >,
): boolean {
  return (
    expense.type === "DEPOSIT_REQUEST" &&
    expense.status === "SUBMITTED" &&
    !expense.isPurchase &&
    !expense.remainingPaymentRequested &&
    !expense.remainingPaymentApproved
  );
}

// ---------------------------------------------------------------------------
// 오류 — 서비스가 던지고 라우트가 상태 코드로 바꾼다
// ---------------------------------------------------------------------------

export const CONVERT_ERROR_STATUS: Record<ConvertErrorCode, number> = {
  FORBIDDEN: 403,
  CONFLICT: 409,
};

export class ConvertError extends Error {
  constructor(
    public code: ConvertErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ConvertError";
  }
}
