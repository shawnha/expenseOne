import { z } from "zod";

/**
 * 회사가 쓰는 기준 통화. 비용 금액 저장/표시가 여기에 묶여 있으므로
 * 앱이 실제로 다룰 수 있는 통화만 허용한다(= expense.ts의 currency와 동일).
 */
export const COMPANY_CURRENCIES = ["KRW", "USD"] as const;
export type CompanyCurrency = (typeof COMPANY_CURRENCIES)[number];

export const createCompanySchema = z.object({
  name: z.string().min(1, "회사명을 입력해주세요").max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "영문 소문자, 숫자, 하이픈만 가능"),
  currency: z.enum(COMPANY_CURRENCIES).optional().default("KRW"),
  slackChannelId: z.string().max(50).optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
});

// 수정에서 slug는 뺀다. slug는 GoWid/Slack 환경변수 이름(GOWID_API_KEY_<SLUG>)과
// 비용 데이터 조회 키로 쓰이므로, 바꾸면 연동이 조용히 끊긴다.
export const updateCompanySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  currency: z.enum(COMPANY_CURRENCIES).optional(),
  slackChannelId: z.string().max(50).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
