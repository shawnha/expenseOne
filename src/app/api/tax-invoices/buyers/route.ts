import { NextRequest, NextResponse } from "next/server";
import { handleError, requireAuth } from "@/lib/api-utils";
import { toActor } from "@/lib/tax-invoice-api";
import { suggestBuyers } from "@/services/tax-invoice.service";

// GET /api/tax-invoices/buyers?q= — 거래처 찾기. 관리자: 전체 요청 + ERP 홈택스 매출 계산서 상대방.
// 그 밖: 본인이 전에 요청한 거래처만(ERP 는 홀세일 매출을 master 에게만 보여 준다 — 넓히지 않는다).

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 50);
    return NextResponse.json({ data: await suggestBuyers(toActor(user), q) });
  } catch (err) {
    return handleError(err);
  }
}
