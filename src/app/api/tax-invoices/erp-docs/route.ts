import { NextRequest, NextResponse } from "next/server";
import { errorResponse, handleError, requireAdmin } from "@/lib/api-utils";
import { listErpSalesDocs } from "@/services/tax-invoice.service";

// GET /api/tax-invoices/erp-docs?date=YYYY-MM-DD&q=&doc= — SIMS 홀세일 전표(하루치). ERP 는 읽기만.
// 관리자 전용: ERP 가 홀세일 매출을 master 에게만 보여 주는데 여기서 전 직원에게 열면 권한이 넓어진다.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const sp = request.nextUrl.searchParams;
    const date = sp.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorResponse("VALIDATION_ERROR", "날짜 형식은 YYYY-MM-DD여야 합니다.");
    const q = (sp.get("q") ?? "").slice(0, 50) || undefined;
    const doc = (sp.get("doc") ?? "").slice(0, 50) || undefined;
    return NextResponse.json({ data: await listErpSalesDocs(date, q, doc) });
  } catch (err) {
    return handleError(err);
  }
}
