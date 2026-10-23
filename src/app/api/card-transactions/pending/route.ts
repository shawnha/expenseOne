import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, handleError, requireAuth } from "@/lib/api-utils";
import { CARD_BATCH_MAX_RANGE_DAYS } from "@/lib/card-batch/types";
import { listPendingCardTransactions } from "@/services/card-batch.service";

// ---------------------------------------------------------------------------
// GET /api/card-transactions/pending?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// 내 카드의 아직 비용으로 올리지 않은 고위드 결제(법카 한 번에 올리기 화면용). 본인 것만.
// 관리자는 scope=unassigned 로 주인 없는 카드(공용 카드)의 결제를 볼 수 있다(card=끝 4자리로 좁히기).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({
  from: z.string().regex(dateRe),
  to: z.string().regex(dateRe),
  /** 관리자 전용: 주인이 연결되지 않은 카드(공용 카드)의 결제 */
  scope: z.enum(["mine", "unassigned"]).optional(),
  card: z.string().regex(/^\d{4}$/).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return errorResponse("VALIDATION_ERROR", "기간을 YYYY-MM-DD 형식으로 보내주세요.");
    const { from, to, scope, card } = parsed.data;
    if (scope === "unassigned" && user.role !== "ADMIN") {
      return errorResponse("FORBIDDEN", "관리자만 볼 수 있습니다.");
    }
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (!Number.isFinite(days) || days < 0) return errorResponse("VALIDATION_ERROR", "시작일이 종료일보다 늦습니다.");
    if (days > CARD_BATCH_MAX_RANGE_DAYS) {
      return errorResponse("VALIDATION_ERROR", `기간은 ${CARD_BATCH_MAX_RANGE_DAYS}일 이내로 골라주세요.`);
    }
    const data = await listPendingCardTransactions(user.id, from, to, {
      unassigned: scope === "unassigned",
      cardLastFour: card ?? null,
    });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleError(err);
  }
}
