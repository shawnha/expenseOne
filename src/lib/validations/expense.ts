import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

const expenseTypeValues = ["CORPORATE_CARD", "DEPOSIT_REQUEST"] as const;
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
  category: z.string().min(1, "카테고리를 선택해주세요").max(100, "카테고리는 100자 이내로 입력해주세요"),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD여야 합니다"),
  companyId: z.string().uuid("올바른 회사 ID를 입력해주세요").optional(),
};

// ---------------------------------------------------------------------------
// 1. Corporate Card submission schema (법카사용 제출)
// ---------------------------------------------------------------------------

export const corporateCardSubmitSchema = z.object({
  ...baseExpenseFields,
  type: z.literal("CORPORATE_CARD"),
  merchantName: z
    .string()
    .max(200, "가맹점명은 200자 이내로 입력해주세요")
    .optional()
    .or(z.literal("")),
  isUrgent: z.boolean().optional().default(false),
});

export type CorporateCardSubmitInput = z.infer<typeof corporateCardSubmitSchema>;

// ---------------------------------------------------------------------------
// 2. Deposit Request submission schema (입금요청 제출)
// ---------------------------------------------------------------------------

export const depositRequestSubmitSchema = z.object({
  ...baseExpenseFields,
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
});

export type DepositRequestSubmitInput = z.infer<typeof depositRequestSubmitSchema>;

// ---------------------------------------------------------------------------
// 3. Unified expense creation schema (discriminated union)
// ---------------------------------------------------------------------------

export const createExpenseSchema = z.discriminatedUnion("type", [
  corporateCardSubmitSchema,
  depositRequestSubmitSchema,
]);

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
  status: z.enum(["SUBMITTED", "APPROVED", "REJECTED", "CANCELLED"]).optional(),
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
