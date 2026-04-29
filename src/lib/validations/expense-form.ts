import { z } from "zod";
import type { DocumentType } from "@/types";

// ============================================================
// 카테고리 옵션 (UI 표시용) - 기본 프리셋
// ============================================================

export const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "ODD", label: "ODD" },
  { value: "MART_PHARMACY", label: "마트/약국" },
  { value: "OTHER", label: "기타" },
];

// ============================================================
// 문서 유형 옵션 (UI 표시용)
// ============================================================

export const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: "ESTIMATE", label: "견적서" },
  { value: "BANK_COPY", label: "통장사본" },
  { value: "ID_CARD", label: "신분증" },
  { value: "BIZ_LICENSE", label: "사업자등록증" },
  { value: "RECEIPT", label: "영수증" },
  { value: "OTHER", label: "기타" },
];

// ============================================================
// 파일 관련 상수
// ============================================================

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

export const ALLOWED_FILE_EXTENSIONS = ".jpeg,.jpg,.png,.webp,.heic,.heif,.pdf";
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_TOTAL_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ============================================================
// 클라이언트 사이드 폼 스키마 (Date 객체 사용)
// ============================================================

const categoryField = z.string().min(1, "카테고리를 선택해주세요").max(100, "카테고리는 100자 이내로 입력해주세요");

// 법카사용 폼 스키마
export const corporateCardFormSchema = z.object({
  title: z
    .string()
    .min(1, "제목을 입력해주세요")
    .max(200, "제목은 200자 이내로 입력해주세요"),
  amount: z
    .number({ message: "금액을 입력해주세요" })
    .int("금액은 원 단위로 입력해주세요")
    .positive("금액은 0보다 커야 합니다"),
  category: categoryField,
  merchantName: z
    .string()
    .max(200, "가맹점명은 200자 이내로 입력해주세요")
    .optional()
    .or(z.literal("")),
  transactionDate: z.date({ message: "거래일을 선택해주세요" }).optional(),
  isUrgent: z.boolean().optional(),
  description: z.string().max(2000, "설명은 2000자 이내로 입력해주세요").optional().or(z.literal("")),
});

// 입금요청 폼 스키마
export const depositRequestFormSchema = z.object({
  title: z
    .string()
    .min(1, "제목을 입력해주세요")
    .max(200, "제목은 200자 이내로 입력해주세요"),
  amount: z
    .number({ message: "금액을 입력해주세요" })
    .int("금액은 원 단위로 입력해주세요")
    .positive("금액은 0보다 커야 합니다"),
  category: categoryField,
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
  isUrgent: z.boolean(),
  isPrePaid: z.boolean(),
  prePaidPercentage: z.number().int().min(1).max(100).nullish(),
  dueDate: z.date({ message: "납입 기일을 선택해주세요" }).nullish(),
  description: z.string().max(2000, "설명은 2000자 이내로 입력해주세요").optional().or(z.literal("")),
});

export type CorporateCardFormData = z.infer<typeof corporateCardFormSchema>;
export type DepositRequestFormData = z.infer<typeof depositRequestFormSchema>;

// ============================================================
// 첨부 파일 클라이언트 타입
// ============================================================

export interface FileWithPreview {
  id: string;
  file: File;
  preview: string | null;
  documentType?: DocumentType;
}

// ============================================================
// 유틸리티: 금액 포맷
// ============================================================

export function formatAmount(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function parseAmount(value: string): number {
  return parseInt(value.replace(/[^\d]/g, ""), 10) || 0;
}

export function formatAmountUSD(value: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function parseAmountUSD(value: string): number {
  return parseFloat(value.replace(/[^0-9.]/g, "")) || 0;
}

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatDateKR(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

export function formatDateISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
