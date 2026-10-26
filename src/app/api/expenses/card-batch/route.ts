import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorResponse, handleError, requireAuth, validateOrigin } from "@/lib/api-utils";
import { CARD_BATCH_MAX, type CardBatchResponse } from "@/lib/card-batch/types";
import { createCardBatch } from "@/services/card-batch.service";

// ---------------------------------------------------------------------------
// POST /api/expenses/card-batch — 법카 결제 여러 건 한 번에 올리기(출장 등)
//
// 본문엔 어느 고위드 거래인지와 제목·카테고리·회사(·비용계획)만 온다. 금액·가맹점·날짜는 서버가 거래에서 읽는다.
// 한 건씩 만들어(건당 슬랙 게시) 시간이 걸릴 수 있다. 결과는 건별 성공/실패.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  companyId: z.string().uuid("회사를 골라주세요."),
  category: z.string().trim().min(1, "카테고리를 골라주세요.").max(100),
  items: z
    .array(
      z.object({
        gowidTxId: z.string().uuid(),
        title: z.string().trim().min(1, "제목이 빈 결제가 있습니다.").max(200, "제목은 200자 이내로 입력해주세요."),
        description: z.string().max(1800).nullish(),
      }),
    )
    .min(1, "올릴 결제를 골라주세요.")
    .max(CARD_BATCH_MAX, `한 번에 ${CARD_BATCH_MAX}건까지 올릴 수 있습니다.`),
  planId: z.string().uuid().nullish(),
});

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return errorResponse("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "));
    }
    const data: CardBatchResponse = await createCardBatch(
      { id: user.id, name: user.name, email: user.email, companyId: user.companyId ?? null, role: user.role },
      parsed.data,
    );

    // 비용계획 「법카로 썼어요」에서 왔으면 올린 비용을 그 계획에 한 번에 잇는다. 연결 규칙(볼 수 있는 계획·같은 법인·
    // 본인 비용·중복)은 linkExpenses 한 곳에서 본다. 실패해도 비용은 그대로 둔다(/api/expenses 의 planId 와 같은 방식).
    const planId = parsed.data.planId ?? null;
    const createdIds = data.results.flatMap((r) => (r.ok ? [r.expenseId] : []));
    if (planId && createdIds.length > 0) {
      data.planLinked = 0;
      data.planLinkError = null;
      try {
        const { isCostPlanningAllowed } = await import("@/lib/plans/flag");
        if (await isCostPlanningAllowed(user.id)) {
          const { linkExpenses } = await import("@/services/plan.service");
          const { linkIds } = await linkExpenses({ id: user.id, role: user.role, name: user.name }, planId, createdIds);
          data.planLinked = linkIds.length;
        } else {
          data.planLinkError = "비용계획을 쓸 수 없는 계정입니다.";
        }
      } catch (err) {
        const { PlanError } = await import("@/lib/plans/errors");
        data.planLinkError = err instanceof PlanError ? err.message : "비용계획 연결에 실패했습니다. 계획 화면에서 연결해주세요.";
        if (!(err instanceof PlanError)) console.error("[Plans] card-batch link failed:", err instanceof Error ? err.name : "unknown");
      }
    }
    if (data.created > 0) {
      revalidatePath("/");
      revalidatePath("/expenses");
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
