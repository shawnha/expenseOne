import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { expenseSpendViewSchema } from "@/lib/admin/expense-purpose";
import { errorResponse, handleError, requireAdmin } from "@/lib/api-utils";
import { getCategoryPurposeBreakdown } from "@/services/expense-purpose.service";

const paramsSchema = z.object({
  category: z.string().min(1).max(100),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  view: expenseSpendViewSchema,
  company: z.string().max(50).nullable(),
});

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const params = request.nextUrl.searchParams;
    const parsed = paramsSchema.safeParse({
      category: params.get("category"), startDate: params.get("startDate"), endDate: params.get("endDate"),
      view: params.get("view"), company: params.get("company"),
    });
    if (!parsed.success) return errorResponse("VALIDATION_ERROR", "카테고리 또는 기간이 올바르지 않습니다.");
    const { category, startDate, endDate, view, company } = parsed.data;
    const data = await getCategoryPurposeBreakdown(category, { startDate, endDate }, view, company);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleError(error);
  }
}
