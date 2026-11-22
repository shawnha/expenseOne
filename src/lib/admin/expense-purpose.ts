import { z } from "zod";

export const EXPENSE_PURPOSES = {
  shooting: "촬영",
  marketing: "광고/마케팅",
  outsourcing: "외주 제작",
  other: "기타",
} as const;

export const expensePurposeSchema = z.enum(["shooting", "marketing", "outsourcing", "other"]);

export type ExpensePurpose = z.infer<typeof expensePurposeSchema>;
export const expensePurposeFilterSchema = z.union([expensePurposeSchema, z.literal("unclassified")]);
export const expenseSpendViewSchema = z.enum(["all", "card", "deposit"]);
export type ExpenseSpendView = z.infer<typeof expenseSpendViewSchema>;
export type ExpensePurposeFilter = z.infer<typeof expensePurposeFilterSchema>;

export function expensePurposeLabel(purpose: ExpensePurposeFilter | null) {
  return purpose && purpose !== "unclassified" ? EXPENSE_PURPOSES[purpose] : "미분류";
}
