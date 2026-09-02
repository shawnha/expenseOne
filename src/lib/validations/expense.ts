import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

const expenseTypeValues = ["CORPORATE_CARD", "DEPOSIT_REQUEST", "REFUND"] as const;
const expenseStatusValues = ["SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"] as const;
// Category is now a free-form string (varchar) with default presets
// Default presets: ODD, MART_PHARMACY, OTHER

// document_type: replaced with varchar to allow user-defined document types

// ---------------------------------------------------------------------------
// Base fields
// ---------------------------------------------------------------------------

const baseExpenseFields = {
  title: z.string().min(1, "제목을 입력해주세요").max(200, "제목은 200자 이내로 입력해주세요"),
  description: z.string().max(2000, "설명은 2000자 이내로 입력해주세요").optional().nullable(),
  amount: z.number().int("금액은 정수여야 합니다").positive("금액은 0보다 커야 합니다"),
  currency: z.enum(["KRW", "USD"]).optional().default("KRW"),
  category: z.string().min(1, "카테고리를 선택해주세요").max(100, "카테고리는 100자 이내로 입력해주세요"),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD여야 합니다"),
  companyId: z.string().uuid("올바른 회사 ID를 입력해주세요").optional(),
};

// ---------------------------------------------------------------------------
// 사입 (약국 납품 → 세금계산서 발행 대상)
//
// 체크만으로는 계산서를 못 만든다. **누구에게 얼마를** 청구할지가 있어야 한다.
// 그래서 체크했을 때만 약국명과 공급가액을 필수로 건다 — 체크 안 했으면
// 전부 선택. refine을 쓰는 이유는 필드끼리 얽힌 조건이라 개별 필드로는
// 표현할 수 없기 때문이다.
//
// 공급가액은 비용 금액(사입가)과 **다르다**. 마진이 붙어서 약국에 청구하는
// 금액이므로 따로 받는다. 부가세·합계는 저장하지 않고 여기서 파생한다.
// ---------------------------------------------------------------------------

/** 사업자등록번호 000-00-00000. 입력 편의를 위해 하이픈 없이 10자리도 받는다. */
export const BIZ_NO_RE = /^\d{3}-?\d{2}-?\d{5}$/;

/** 하이픈 없는 10자리를 표준 표기로 맞춘다. */
export function normalizeBizNo(v: string): string {
  const d = v.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : v;
}

/** 약국 한 곳 = 계산서 한 줄. */
export const purchaseLineSchema = z.object({
  pharmacyName: z
    .string()
    .min(1, "약국명을 입력해주세요")
    .max(100, "약국명은 100자 이내로 입력해주세요"),
  pharmacyBizNo: z
    .string()
    .regex(BIZ_NO_RE, "사업자등록번호는 000-00-00000 형식으로 입력해주세요")
    .optional()
    .nullable()
    .or(z.literal("")),
  supplyAmount: z
    .number()
    .int("공급가액은 정수여야 합니다")
    .positive("공급가액을 입력해주세요"),
  purchaseItems: z.string().max(1000, "품목은 1000자 이내로 입력해주세요").optional().nullable(),
});

export type PurchaseLineInput = z.infer<typeof purchaseLineSchema>;

const purchaseFields = {
  isPurchase: z.boolean().optional().default(false),
  /** 약국별 줄. 사입을 체크했으면 최소 1줄이 있어야 한다. */
  purchaseLines: z.array(purchaseLineSchema).max(50, "약국은 최대 50곳까지입니다").optional(),
};

/** 사입 관련 필드만 본 형태. refine 콜백이 union·object 어느 쪽에서도 통하게 한다. */
type PurchaseShape = {
  isPurchase?: boolean;
  purchaseLines?: PurchaseLineInput[];
};

/** 사입을 체크했으면 약국 줄이 최소 하나 있어야 한다. */
function requirePurchaseFields<T extends z.ZodTypeAny>(schema: T) {
  return schema.refine((d) => {
    const p = d as PurchaseShape;
    return !p.isPurchase || (p.purchaseLines?.length ?? 0) > 0;
  }, { message: "납품처 약국을 최소 한 곳 입력해주세요", path: ["purchaseLines"] });
}

// ---------------------------------------------------------------------------
// 1. Corporate Card submission schema (법카사용 제출)
// ---------------------------------------------------------------------------

// discriminatedUnion은 **순수 ZodObject만** 받는다. refine을 붙이면 ZodEffects가
// 돼서 union에 못 넣는다. 그래서 base(object)와 refine을 씌운 것을 나눠 둔다 —
// union은 base를 쓰고, 폼 resolver는 refine이 붙은 쪽을 쓴다.
const corporateCardSubmitBase = z.object({
  ...baseExpenseFields,
  ...purchaseFields,
  type: z.literal("CORPORATE_CARD"),
  merchantName: z
    .string()
    .max(200, "가맹점명은 200자 이내로 입력해주세요")
    .optional()
    .or(z.literal("")),
  isUrgent: z.boolean().optional().default(false),
  hasFreelancerWithholding: z.boolean().optional().default(false),
});

export const corporateCardSubmitSchema = requirePurchaseFields(corporateCardSubmitBase);

export type CorporateCardSubmitInput = z.infer<typeof corporateCardSubmitSchema>;

// ---------------------------------------------------------------------------
// 2. Deposit Request submission schema (입금요청 제출)
// ---------------------------------------------------------------------------

const depositRequestSubmitBase = z.object({
  ...baseExpenseFields,
  ...purchaseFields,
  type: z.literal("DEPOSIT_REQUEST"),
  bankName: z
    .string()
    .min(1, "은행명을 입력해주세요")
    .max(50, "은행명은 50자 이내로 입력해주세요"),
  accountHolder: z
    .string()
    .min(1, "예금주를 입력해주세요")
    .max(100, "예금주는 100자 이내로 입력해주세요"),
  accountNumber: z
    .string()
    .min(1, "계좌번호를 입력해주세요")
    .max(50, "계좌번호는 50자 이내로 입력해주세요"),
  isUrgent: z.boolean().optional().default(false),
  isPrePaid: z.boolean().optional().default(false),
  prePaidPercentage: z.number().int().min(1).max(100).optional().nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD여야 합니다")
    .optional()
    .nullable(),
  hasFreelancerWithholding: z.boolean().optional().default(false),
});

export const depositRequestSubmitSchema = requirePurchaseFields(depositRequestSubmitBase);

export type DepositRequestSubmitInput = z.infer<typeof depositRequestSubmitSchema>;

// ---------------------------------------------------------------------------
// 2-1. Refund submission schema (반품/환불 제출)
//   회사·카테고리·통화·환율은 원거래에서 상속하므로 받지 않는다.
//   amount는 양수로 받고(amount > 0 CHECK), 표시/집계에서 차감 처리.
// ---------------------------------------------------------------------------

export const refundSubmitSchema = z.object({
  type: z.literal("REFUND"),
  originalExpenseId: z.string().uuid("원거래를 선택해주세요"),
  // 환불 금액: 원거래 통화 기준 (KRW면 원, USD면 센트)
  amount: z.number().int("금액은 정수여야 합니다").positive("금액은 0보다 커야 합니다"),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD여야 합니다"),
  description: z.string().max(2000, "사유는 2000자 이내로 입력해주세요").optional().nullable(),
});

export type RefundSubmitInput = z.infer<typeof refundSubmitSchema>;

// ---------------------------------------------------------------------------
// 3. Unified expense creation schema (discriminated union)
// ---------------------------------------------------------------------------

export const createExpenseSchema = requirePurchaseFields(
  z.discriminatedUnion("type", [
    corporateCardSubmitBase,
    depositRequestSubmitBase,
    refundSubmitSchema,
  ]),
);

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

// ---------------------------------------------------------------------------
// 4. Expense update schema (비용 수정)
// ---------------------------------------------------------------------------

export const updateExpenseSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  amount: z.number().int().positive().optional(),
  category: z.string().min(1).max(100).optional(),
  transactionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  // Corporate card fields
  merchantName: z.string().max(200).optional(),
  // Deposit request fields
  bankName: z.string().max(50).optional(),
  accountHolder: z.string().max(100).optional(),
  accountNumber: z.string().max(50).optional(),
  isUrgent: z.boolean().optional(),
  isPrePaid: z.boolean().optional(),
  prePaidPercentage: z.number().int().min(1).max(100).optional().nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  status: z.enum(["SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
  companyId: z.string().uuid().optional(),
  hasFreelancerWithholding: z.boolean().optional(),
  ...purchaseFields,
  // 호점 구분 (마트/약국 실비 정리용). null 이면 미지정으로 해제.
  branch: z.enum(["STORE_1", "STORE_2"]).nullable().optional(),
});

export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

// ---------------------------------------------------------------------------
// 5. Reject schema
// ---------------------------------------------------------------------------

export const rejectExpenseSchema = z.object({
  rejectionReason: z
    .string()
    .min(1, "반려 사유를 입력해주세요")
    .max(1000, "반려 사유는 1000자 이내로 입력해주세요"),
});

export type RejectExpenseInput = z.infer<typeof rejectExpenseSchema>;

// ---------------------------------------------------------------------------
// 6. Filter / search query schema (GET /api/expenses)
// ---------------------------------------------------------------------------

export const expenseQuerySchema = z.object({
  type: z.enum(expenseTypeValues).optional(),
  status: z.enum(expenseStatusValues).optional(),
  category: z.string().max(100).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  search: z.string().max(200).optional(),
  sortBy: z.enum(["createdAt", "amount", "status"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  ownOnly: z.enum(["true", "false"]).optional(),
  company: z.string().max(50).optional(),
  autoClassified: z.enum(["all", "auto", "manual"]).optional(),
  freelancer: z.enum(["all", "true"]).optional(),
  /**
   * 선지급 필터.
   *  - "true"      선지급 건 전부
   *  - "remaining" 그중 **잔금이 남은 건**(부분 선지급인데 후지급 미승인)
   */
  prePaid: z.enum(["all", "true", "remaining"]).optional(),
});

export type ExpenseQueryInput = z.infer<typeof expenseQuerySchema>;

// ---------------------------------------------------------------------------
// 7. CSV export query schema
// ---------------------------------------------------------------------------

export const csvExportQuerySchema = z.object({
  type: z.enum(expenseTypeValues).optional(),
  status: z.enum(expenseStatusValues).optional(),
  category: z.string().max(100).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  company: z.string().max(50).optional(),
  freelancer: z.enum(["all", "true"]).optional(),
  // 호점 필터: STORE_1 / STORE_2 / none(미지정만)
  branch: z.enum(["STORE_1", "STORE_2", "none"]).optional(),
  // true 이면 제출·승인 건만(반려·취소 제외) — 화면 집계와 일치시키는 정산용 export
  activeOnly: z.enum(["true"]).optional(),
});

export type CsvExportQueryInput = z.infer<typeof csvExportQuerySchema>;

// ---------------------------------------------------------------------------
// 8. Attachment upload schema
// ---------------------------------------------------------------------------

export const attachmentUploadSchema = z.object({
  expenseId: z.string().uuid("올바른 비용 ID를 입력해주세요"),
  documentType: z.string().min(1, "문서 유형을 입력해주세요").max(100, "문서 유형은 100자 이내로 입력해주세요"),
});

export type AttachmentUploadInput = z.infer<typeof attachmentUploadSchema>;

// ---------------------------------------------------------------------------
// 9. 반복 입금요청 (정기 지출 템플릿)
// ---------------------------------------------------------------------------

export const recurringFrequencies = ["WEEKLY", "MONTHLY", "YEARLY"] as const;

const recurringBase = z.object({
  title: z.string().min(1, "제목을 입력해주세요").max(200, "제목은 200자 이내로 입력해주세요"),
  description: z.string().max(2000).optional().nullable(),
  amount: z.number().int("금액은 정수여야 합니다").positive("금액은 0보다 커야 합니다"),
  currency: z.enum(["KRW", "USD"]).optional().default("KRW"),
  category: z.string().min(1, "카테고리를 선택해주세요").max(100),
  bankName: z.string().min(1, "은행명을 입력해주세요").max(50),
  accountHolder: z.string().min(1, "예금주를 입력해주세요").max(100),
  accountNumber: z.string().min(1, "계좌번호를 입력해주세요").max(50),
  companyId: z.string().uuid("회사를 선택해주세요"),

  frequency: z.enum(recurringFrequencies),
  intervalCount: z.number().int().min(1).max(12).optional().default(1),
  dayOfMonth: z.number().int().min(1).max(31).optional().nullable(),
  monthOfYear: z.number().int().min(1).max(12).optional().nullable(),
  weekday: z.number().int().min(0).max(6).optional().nullable(),

  /** 납입 기일을 생성일로부터 며칠 뒤로. null이면 기일 없음. */
  dueDateOffsetDays: z.number().int().min(0).max(90).optional().nullable(),
  attachFiles: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

/**
 * 주기별로 필요한 값이 채워져 있어야 한다. 없으면 다음 날짜를 계산할 수 없고,
 * DB CHECK에서 거부되면 사용자에게 무슨 값이 빠졌는지 안 보인다.
 */
export const recurringExpenseSchema = recurringBase
  .refine((d) => d.frequency !== "WEEKLY" || d.weekday != null, {
    message: "요일을 선택해주세요",
    path: ["weekday"],
  })
  .refine((d) => d.frequency === "WEEKLY" || d.dayOfMonth != null, {
    message: "며칠에 등록할지 선택해주세요",
    path: ["dayOfMonth"],
  })
  .refine((d) => d.frequency !== "YEARLY" || d.monthOfYear != null, {
    message: "몇 월에 등록할지 선택해주세요",
    path: ["monthOfYear"],
  });

export type RecurringExpenseInput = z.infer<typeof recurringExpenseSchema>;
