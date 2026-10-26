import { NextResponse } from "next/server";
import { handleError, requireAuth } from "@/lib/api-utils";
import { summarizePendingCardTransactions } from "@/services/card-batch.service";

// ---------------------------------------------------------------------------
// GET /api/card-transactions/pending/summary
//
// 「아직 안 올린 결제 N건」 — 최근 60일 내 카드의 미처리 고위드 결제 수·합계(본인 것만).
// 「+」 화면의 법카 카드와 법카 폼 위 안내가 쓴다.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    const data = await summarizePendingCardTransactions(user.id);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleError(err);
  }
}
