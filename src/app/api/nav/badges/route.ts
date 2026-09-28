import { NextResponse } from "next/server";
import { handleError, requireAuth } from "@/lib/api-utils";
import { isCostPlanningAllowed } from "@/lib/plans/flag";
import { summarizeError } from "@/lib/plans/errors";
import { countPlanAttention } from "@/services/plan.service";
import { countPendingApprovals } from "@/services/expense.service";
import { countPendingTaxInvoices } from "@/services/tax-invoice.service";

// ---------------------------------------------------------------------------
// GET /api/nav/badges -- 사이드 메뉴·탭 바의 숫자(오너 요청 2026-09-28: 알림만으로는 무엇이 바뀌었는지 모른다).
//   plans   : 새 소식이 있는 계획 수(다른 사람의 추가·수정·취소·연결 + 안 읽은 메모). 스위치가 꺼졌으면 null.
//   pending : 승인 대기(관리자만, 아니면 null).
//   taxInvoices : 세금계산서 발행 대기(관리자만, 아니면 null).
// 한쪽이 실패해도 다른 쪽은 준다 — 숫자는 보조 정보라 화면을 막을 이유가 없다.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    const s = summarizeError(err);
    console.error(`[NavBadges] ${label} 실패: ${s.name}: ${s.message}`);
    return null;
  }
}

export async function GET() {
  try {
    const user = await requireAuth();
    const [plans, pending, taxInvoices] = await Promise.all([
      safe("plans", async () =>
        (await isCostPlanningAllowed(user.id)) ? countPlanAttention({ id: user.id, role: user.role }) : null,
      ),
      user.role === "ADMIN" ? safe("pending", countPendingApprovals) : Promise.resolve(null),
      user.role === "ADMIN" ? safe("taxInvoices", countPendingTaxInvoices) : Promise.resolve(null),
    ]);
    return NextResponse.json(
      { data: { plans, pending, taxInvoices } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    return handleError(err);
  }
}
