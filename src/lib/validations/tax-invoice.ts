import { z } from "zod";
import { CHARGE_TYPES, ISSUER_CODES, bizNoDigits } from "@/lib/tax-invoice";

// ---------------------------------------------------------------------------
// 세금계산서 발행 요청 입력 검증 (서버 라우트 + 폼 공용). DB CHECK(drizzle/0026)와 같은 범위.
// ---------------------------------------------------------------------------

const AMOUNT_MAX = 2_147_483_647;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD여야 합니다");

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}은(는) ${max}자 이내로 입력해주세요`)
    .nullish()
    .transform((v) => (v ? v : null));

const fields = {
  issuerCode: z.enum(ISSUER_CODES, { message: "발행 법인을 선택해주세요" }),
  buyerName: z.string().trim().min(1, "거래처 상호를 입력해주세요").max(200, "상호는 200자 이내로 입력해주세요"),
  buyerBizNo: z
    .string()
    .transform(bizNoDigits)
    .refine((v) => /^\d{10}$/.test(v), "사업자등록번호는 숫자 10자리입니다"),
  buyerCeo: optionalText(100, "대표자"),
  buyerEmail: z
    .string()
    .trim()
    .max(254)
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "이메일 형식이 올바르지 않습니다"),
  buyerAddress: optionalText(300, "주소"),
  items: z.string().trim().min(1, "품목을 입력해주세요").max(1000, "품목은 1000자 이내로 입력해주세요"),
  supplyAmount: z.number().int("공급가액은 원 단위 정수입니다").positive("금액을 입력해주세요").max(AMOUNT_MAX),
  vatAmount: z.number().int("부가세는 원 단위 정수입니다").min(0).max(AMOUNT_MAX),
  supplyDate: isoDate,
  chargeType: z.enum(CHARGE_TYPES).default("CHARGE"),
  memo: optionalText(2000, "메모"),
  erpSalesDate: isoDate.nullish().transform((v) => v ?? null),
  erpDocumentNo: z.string().trim().max(50).nullish().transform((v) => (v ? v : null)),
};

const erpPair = (d: { erpSalesDate?: string | null; erpDocumentNo?: string | null }) =>
  (d.erpSalesDate == null) === (d.erpDocumentNo == null);

export const createTaxInvoiceSchema = z
  .object(fields)
  .refine(erpPair, { message: "SIMS 전표는 날짜와 번호가 함께 있어야 합니다", path: ["erpDocumentNo"] });
export type CreateTaxInvoiceInput = z.infer<typeof createTaxInvoiceSchema>;

/** 수정은 발행 대기일 때만. 같은 모양 전체를 다시 보낸다(폼이 전부 들고 있다). */
export const updateTaxInvoiceSchema = createTaxInvoiceSchema;
export type UpdateTaxInvoiceInput = CreateTaxInvoiceInput;

export const taxInvoiceIssuedSchema = z.object({ issued: z.boolean() });
export const taxInvoiceCancelSchema = z.object({
  reason: z.string().trim().max(500, "사유는 500자 이내로 입력해주세요").nullish().transform((v) => (v ? v : null)),
});
