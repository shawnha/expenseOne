import { z } from "zod";

export const createCompanySchema = z.object({
  name: z.string().min(1, "회사명을 입력해주세요").max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "영문 소문자, 숫자, 하이픈만 가능"),
  slackChannelId: z.string().max(50).optional().nullable(),
  sortOrder: z.number().int().optional().default(0),
});

export const updateCompanySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slackChannelId: z.string().max(50).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
