import { z } from "zod";

export function expenseListPeriod(params: { startDate?: unknown; endDate?: unknown }) {
  return {
    startDate: z.iso.date().safeParse(params.startDate).data,
    endDate: z.iso.date().safeParse(params.endDate).data,
  };
}
