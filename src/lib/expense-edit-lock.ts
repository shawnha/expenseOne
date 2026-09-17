/**
 * 승인된 입금요청 수정 잠금 — 순수 함수 모듈
 *
 * 입금요청 승인은 "이 금액을 이 계좌로 보낸다"는 관리자의 결정이다. 승인 뒤에
 * 요청자가 금액·계좌를 바꿀 수 있으면 승인한 내용과 실제 지급할 내용이 어긋난다.
 * 그래서 비관리자가 APPROVED 입금요청을 고칠 때는 지급 판단에 쓰인 필드를 잠그고,
 * 제목·설명처럼 기록 정리용 필드만 허용한다.
 *
 * 서버(updateExpense)와 화면이 같은 규칙을 봐야 하고 단위 테스트도 따로 돌려야
 * 해서 DB·Next는 import하지 않는다. 타입만 가져온다.
 */
import type { PurchaseLineInput, UpdateExpenseInput } from "@/lib/validations/expense";

// ---------------------------------------------------------------------------
// 필드 분류
//
// satisfies로 UpdateExpenseInput의 **모든 키**를 분류하게 강제한다. 수정 스키마에
// 필드가 추가되면 여기서 tsc가 멈춘다 — 새 필드가 잠금 판단에서 조용히 빠지는 일을
// 막기 위해서다.
// ---------------------------------------------------------------------------

export type EditFieldPolicy = "locked" | "allowed" | "ignored";

export const EDIT_FIELD_POLICY = {
  // 지급 판단에 쓰인 값 — 승인 후에는 관리자만 바꾼다
  amount: "locked",
  companyId: "locked",
  bankName: "locked",
  accountHolder: "locked",
  accountNumber: "locked",
  isPrePaid: "locked",
  prePaidPercentage: "locked",
  hasFreelancerWithholding: "locked",
  transactionDate: "locked",
  isPurchase: "locked",
  purchaseLines: "locked",
  // 기록 정리용 — 영수증 보충·오타 수정은 승인 후에도 된다
  title: "allowed",
  description: "allowed",
  category: "allowed",
  isUrgent: "allowed",
  dueDate: "allowed",
  merchantName: "allowed",
  branch: "allowed",
  // 비관리자가 보낸 status는 updateExpense가 원래 무시한다
  status: "ignored",
} as const satisfies Record<keyof UpdateExpenseInput, EditFieldPolicy>;

type Policy = typeof EDIT_FIELD_POLICY;

export type LockedFieldKey = {
  [K in keyof Policy]: Policy[K] extends "locked" ? K : never;
}[keyof Policy];

/** 에러 메시지·화면 안내에 쓰는 이름. 메시지에 나오는 순서도 이 순서다. */
export const LOCKED_FIELD_LABELS = {
  amount: "금액",
  companyId: "회사",
  bankName: "은행명",
  accountHolder: "예금주",
  accountNumber: "계좌번호",
  isPrePaid: "선지급 여부",
  prePaidPercentage: "선지급 비율",
  hasFreelancerWithholding: "원천징수",
  transactionDate: "거래일",
  isPurchase: "사입 여부",
  purchaseLines: "사입 약국 내역",
} as const satisfies Record<LockedFieldKey, string>;

export const LOCKED_FIELD_KEYS = Object.keys(LOCKED_FIELD_LABELS) as LockedFieldKey[];

// ---------------------------------------------------------------------------
// 적용 조건
// ---------------------------------------------------------------------------

/**
 * 잠금이 걸리는가. status는 **DB에서 읽은 현재 값**을 넘겨야 한다 — 요청 본문의
 * status를 넘기면 비관리자가 값을 바꿔 보내는 것만으로 잠금을 피할 수 있다.
 */
export function isApprovedDepositLocked(
  userRole: string | null | undefined,
  expense: { type: string; status: string },
): boolean {
  return (
    userRole !== "ADMIN" &&
    expense.type === "DEPOSIT_REQUEST" &&
    expense.status === "APPROVED"
  );
}

// ---------------------------------------------------------------------------
// 변경 판단
// ---------------------------------------------------------------------------

/** 비교에 필요한 현재 비용 값. DB 행(expenses.$inferSelect)을 그대로 넘기면 된다. */
export interface LockableExpense {
  amount: number;
  companyId: string | null;
  bankName: string | null;
  accountHolder: string | null;
  accountNumber: string | null;
  isPrePaid: boolean;
  prePaidPercentage: number | null;
  hasFreelancerWithholding: boolean;
  transactionDate: string;
  isPurchase: boolean;
}

/** 현재 저장된 사입 줄. sortOrder 순서로 읽어 넘겨야 순서 비교가 맞다. */
export interface LockablePurchaseLine {
  pharmacyName: string;
  pharmacyBizNo: string | null;
  supplyAmount: number;
  vatAmount: number;
  purchaseItems: string | null;
}

type ChangeCheck = (
  current: LockableExpense,
  input: UpdateExpenseInput,
  currentLines: readonly LockablePurchaseLine[],
) => boolean;

/**
 * 계좌 정보 비교용. 폼은 빈 칸을 ""로, DB는 null로 들고 있어서 둘을 같게 본다.
 * trim은 하지 않는다 — 계좌번호 앞뒤 공백도 저장되는 값이 달라지는 것이라
 * "같은 값"으로 넘기면 승인 뒤 계좌가 바뀐 채 저장된다.
 */
function blankToEmpty(v: string | null | undefined): string {
  return v ?? "";
}

/**
 * 사입 줄 한 줄을 비교용 값으로. 저장 규칙(replacePurchaseLines)과 같게 맞춘다 —
 * 약국명·품목은 trim해서 저장되고, 사업자번호는 하이픈 유무만 다르게 들어올 수 있다.
 */
function purchaseLineSignature(line: {
  pharmacyName: string;
  pharmacyBizNo?: string | null;
  supplyAmount: number;
  vatAmount?: number | null;
  purchaseItems?: string | null;
}): string {
  return JSON.stringify([
    line.pharmacyName.trim(),
    (line.pharmacyBizNo ?? "").replace(/\D/g, ""),
    line.supplyAmount,
    // 요청 쪽은 스키마의 vatAmount default(0) 때문에 파싱 후 항상 숫자다.
    // 이 대체값은 null이 들어올 수 있는 호출(직접 만든 객체 등)을 위한 안전장치일 뿐이다.
    line.vatAmount ?? Math.round(line.supplyAmount * 0.1),
    (line.purchaseItems ?? "").trim(),
  ]);
}

function purchaseLinesChanged(
  next: readonly PurchaseLineInput[],
  current: readonly LockablePurchaseLine[],
): boolean {
  if (next.length !== current.length) return true;
  return next.some(
    (line, i) => purchaseLineSignature(line) !== purchaseLineSignature(current[i]),
  );
}

/**
 * 필드별 "바뀌었나" 판단. 키가 undefined면 호출 전에 걸러지므로 여기서는
 * 값이 온 경우만 본다. satisfies로 잠금 필드마다 판단이 하나씩 있게 강제한다.
 */
const IS_CHANGED = {
  amount: (c, i) => i.amount !== c.amount,
  // uuid는 대소문자만 달라도 같은 회사다
  companyId: (c, i) =>
    (i.companyId ?? "").toLowerCase() !== (c.companyId ?? "").toLowerCase(),
  bankName: (c, i) => blankToEmpty(i.bankName) !== blankToEmpty(c.bankName),
  accountHolder: (c, i) =>
    blankToEmpty(i.accountHolder) !== blankToEmpty(c.accountHolder),
  accountNumber: (c, i) =>
    blankToEmpty(i.accountNumber) !== blankToEmpty(c.accountNumber),
  isPrePaid: (c, i) => i.isPrePaid !== c.isPrePaid,
  // 폼은 선지급이 아니면 null을 보낸다. DB의 null과 같게 본다.
  prePaidPercentage: (c, i) =>
    (i.prePaidPercentage ?? null) !== (c.prePaidPercentage ?? null),
  hasFreelancerWithholding: (c, i) =>
    i.hasFreelancerWithholding !== c.hasFreelancerWithholding,
  // 둘 다 YYYY-MM-DD 문자열(drizzle date mode: "string")
  transactionDate: (c, i) => i.transactionDate !== c.transactionDate,
  isPurchase: (c, i) => i.isPurchase !== c.isPurchase,
  purchaseLines: (_c, i, lines) => purchaseLinesChanged(i.purchaseLines ?? [], lines),
} satisfies Record<LockedFieldKey, ChangeCheck>;

/**
 * 입력에서 **실제로 값이 바뀐** 잠금 필드 키를 돌려준다(LOCKED_FIELD_LABELS 순서).
 * 빈 배열이면 잠금 필드는 전부 그대로이거나 아예 안 온 것이다.
 *
 * @param currentLines 현재 사입 줄. input.purchaseLines가 올 때만 쓰인다.
 */
export function findLockedChanges(
  current: LockableExpense,
  input: UpdateExpenseInput,
  currentLines: readonly LockablePurchaseLine[],
): LockedFieldKey[] {
  return LOCKED_FIELD_KEYS.filter(
    (key) => input[key] !== undefined && IS_CHANGED[key](current, input, currentLines),
  );
}

/** 잠금 필드를 뺀 입력. 같은 값으로 온 잠금 필드는 저장할 이유가 없다. */
export function omitLockedFields(input: UpdateExpenseInput): UpdateExpenseInput {
  const rest: UpdateExpenseInput = { ...input };
  for (const key of LOCKED_FIELD_KEYS) {
    delete rest[key];
  }
  return rest;
}

/** 403 응답 메시지. 수정 폼은 error.message를 그대로 보여준다. */
export function lockedChangeMessage(keys: readonly LockedFieldKey[]): string {
  const names = keys.map((key) => LOCKED_FIELD_LABELS[key]).join(", ");
  return `승인된 입금요청은 ${names}을(를) 수정할 수 없습니다. 변경이 필요하면 관리자에게 승인 취소를 요청해주세요.`;
}
