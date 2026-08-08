import { z } from "zod";

/**
 * 회사가 쓰는 기준 통화. 비용 금액 저장/표시가 여기에 묶여 있으므로
 * 앱이 실제로 다룰 수 있는 통화만 허용한다(= expense.ts의 currency와 동일).
 */
export const COMPANY_CURRENCIES = ["KRW", "USD"] as const;
export type CompanyCurrency = (typeof COMPANY_CURRENCIES)[number];

export const createCompanySchema = z.object({
  name: z.string().min(1, "회사명을 입력해주세요").max(100),
  // 하이픈 금지 — 환경변수 이름 왕복이 깨진다.
  //
  // slug는 `GOWID_API_KEY_<SLUG 대문자>` 이름으로 나갔다가, 동기화 때 접미사를
  // 소문자로 되돌려 회사를 찾는다. 하이픈이 있으면 나갈 때 `_`로 바뀌고 돌아올
  // 땐 `_`로 남아 원래 slug와 달라진다(hanah-one-partners → HANAH_ONE_PARTNERS
  // → hanah_one_partners). 그러면 관리 화면은 연동됐다고 초록 체크를 띄우는데
  // 동기화는 회사를 못 찾아 카드 거래가 전부 회사 미지정으로 들어간다.
  // 영숫자만 허용하면 왕복이 항상 항등이 된다(기존 4개 slug 모두 해당).
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9]+$/, "영문 소문자와 숫자만 가능합니다 (하이픈 불가)"),
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
