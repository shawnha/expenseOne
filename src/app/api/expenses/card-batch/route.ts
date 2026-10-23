import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { errorResponse, handleError, requireAuth, validateOrigin } from "@/lib/api-utils";
import { CARD_BATCH_MAX } from "@/lib/card-batch/types";
import { createCardBatch } from "@/services/card-batch.service";

// ---------------------------------------------------------------------------
// POST /api/expenses/card-batch — 법카 결제 여러 건 한 번에 올리기(출장 등)
//
// 본문엔 어느 고위드 거래인지와 제목·카테고리·회사만 온다. 금액·가맹점·날짜는 서버가 거래에서 읽는다.
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
    const data = await createCardBatch(
      { id: user.id, name: user.name, email: user.email, companyId: user.companyId ?? null, role: user.role },
      parsed.data,
    );
    if (data.created > 0) {
      revalidatePath("/");
      revalidatePath("/expenses");
    }
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
