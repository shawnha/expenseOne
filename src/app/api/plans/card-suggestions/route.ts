import { NextRequest } from "next/server";
import { z } from "zod";
import { handlePlanError, parseOrThrow, planJson, requirePlanActor } from "@/lib/plans/api";
import { suggestPlansForCard } from "@/services/plan-picks.service";

// ---------------------------------------------------------------------------
// GET /api/plans/card-suggestions?companyId=&amount=&date=&merchant=
//
// 고위드 알림으로 연 법카 폼의 「이 결제, 계획에 연결할까요?」 — 같은 법인·결제일 ±45일 계획을 점수순 3건.
// 잇는 건 제출 때 사람이 고른 계획 하나뿐이다(POST /api/expenses 의 planId).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

const querySchema = z.object({
  companyId: z.string().uuid(),
  amount: z.coerce.number().int().positive().max(10_000_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  merchant: z.string().max(200).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const actor = await requirePlanActor();
    const q = parseOrThrow(querySchema, Object.fromEntries(request.nextUrl.searchParams));
    return planJson({
      suggestions: await suggestPlansForCard(actor, {
        companyId: q.companyId,
        amount: q.amount,
        date: q.date,
        merchant: q.merchant ?? null,
      }),
    });
  } catch (err) {
    return handlePlanError(err);
  }
}
