import { z } from "zod";

export const settlementMonthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const settlementSubjectSchema = z.object({
  brandName: z.string().trim().min(1).max(100),
  month: settlementMonthSchema,
}).strict();
export const settlementSourceSchema = z.enum(["PLAN", "REQUEST"]);
export type SettlementSource = z.infer<typeof settlementSourceSchema>;
export type SettlementSubject = z.infer<typeof settlementSubjectSchema>;

export function currentSettlementMonth() {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Seoul" }).format(new Date());
}
