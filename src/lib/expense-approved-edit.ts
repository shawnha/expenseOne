/**
 * 승인된 입금요청의 "돈 관련 칸" 감시 — 순수 함수 모듈
 *
 * 입금요청 승인은 "이 금액을 이 계좌로 보낸다"는 관리자의 결정이다. 승인 뒤에 그 값이 바뀌면
 * 승인한 내용과 실제 지급할 내용이 어긋난다. 2026-09-17에는 이걸 **막았지만**, 작성자가 자기 건을
 * 고치지 못해 실무가 막혔다 — 2026-09-23 오너 결정으로 **막지 않고 알린다**: 작성자가 금액·계좌를
 * 바꾸면 저장은 되고, 관리자에게 알림이 간다(Slack 메시지도 바뀐 값으로 다시 올라간다).
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

export type EditFieldPolicy = "money" | "record" | "ignored";

export const EDIT_FIELD_POLICY = {
  // 지급 판단에 쓰인 값 — 승인 뒤에 바뀌면 관리자에게 알린다
  amount: "money",
  companyId: "money",
  bankName: "money",
  accountHolder: "money",
  accountNumber: "money",
  isPrePaid: "money",
  prePaidPercentage: "money",
  hasFreelancerWithholding: "money",
  transactionDate: "money",
  isPurchase: "money",
  purchaseLines: "money",
  // 기록 정리용 — 바뀌어도 알리지 않는다
  title: "record",
  description: "record",
  category: "record",
  isUrgent: "record",
  dueDate: "record",
  merchantName: "record",
  branch: "record",
  // 비관리자가 보낸 status는 updateExpense가 원래 무시한다
  status: "ignored",
} as const satisfies Record<keyof UpdateExpenseInput, EditFieldPolicy>;

type Policy = typeof EDIT_FIELD_POLICY;

export type MoneyFieldKey = {
  [K in keyof Policy]: Policy[K] extends "money" ? K : never;
}[keyof Policy];

/** 알림 문구에 쓰는 이름. 문구에 나오는 순서도 이 순서다. */
export const MONEY_FIELD_LABELS = {
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
} as const satisfies Record<MoneyFieldKey, string>;

export const MONEY_FIELD_KEYS = Object.keys(MONEY_FIELD_LABELS) as MoneyFieldKey[];

// ---------------------------------------------------------------------------
// 적용 조건
// ---------------------------------------------------------------------------

/**
 * 이 수정이 "승인된 입금요청을 작성자가 고치는" 경우인가 — 알림 대상 판단.
 * status는 **DB에서 읽은 현재 값**을 넘겨야 한다. 관리자가 직접 고친 건은 알리지 않는다
 * (승인한 사람이 바꾼 것이라 알릴 대상이 곧 자기 자신이다).
 */
export function isApprovedDepositEdit(
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
export interface MoneyComparableExpense {
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
export interface ComparablePurchaseLine {
  pharmacyName: string;
  pharmacyBizNo: string | null;
  supplyAmount: number;
  vatAmount: number;
  purchaseItems: string | null;
}

type ChangeCheck = (
  current: MoneyComparableExpense,
  input: UpdateExpenseInput,
  currentLines: readonly ComparablePurchaseLine[],
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
  current: readonly ComparablePurchaseLine[],
): boolean {
  if (next.length !== current.length) return true;
  return next.some(
    (line, i) => purchaseLineSignature(line) !== purchaseLineSignature(current[i]),
  );
}

/**
 * 필드별 "바뀌었나" 판단. 키가 undefined면 호출 전에 걸러지므로 여기서는
 * 값이 온 경우만 본다. satisfies로 돈 관련 필드마다 판단이 하나씩 있게 강제한다.
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
} satisfies Record<MoneyFieldKey, ChangeCheck>;

/**
 * 입력에서 **실제로 값이 바뀐** 돈 관련 키를 돌려준다(MONEY_FIELD_LABELS 순서).
 * 빈 배열이면 돈 관련 칸은 전부 그대로이거나 아예 안 온 것이다.
 *
 * @param currentLines 현재 사입 줄. input.purchaseLines가 올 때만 쓰인다.
 */
export function findMoneyFieldChanges(
  current: MoneyComparableExpense,
  input: UpdateExpenseInput,
  currentLines: readonly ComparablePurchaseLine[],
): MoneyFieldKey[] {
  return MONEY_FIELD_KEYS.filter(
    (key) => input[key] !== undefined && IS_CHANGED[key](current, input, currentLines),
  );
}

/** 관리자 알림 문구. 승인 뒤 바뀐 칸을 그대로 읽어 준다. */
export function approvedEditNoticeMessage(
  editorName: string,
  title: string,
  keys: readonly MoneyFieldKey[],
): string {
  const names = keys.map((key) => MONEY_FIELD_LABELS[key]).join(", ");
  return `${editorName}님이 승인된 입금요청 "${title}"의 ${names}을(를) 수정했습니다.`;
}
