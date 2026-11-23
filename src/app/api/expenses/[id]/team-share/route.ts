import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, handleError, requireAuth, validateOrigin, validateUUID } from "@/lib/api-utils";
import { saveExpenseShare } from "@/services/team-expense.service";

const shareInput = z.object({ departmentId: z.union([z.uuid(), z.literal("auto"), z.null()]) }).strict();

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originError = validateOrigin(request);
    if (originError) return originError;
    const user = await requireAuth();

    const id = validateUUID((await context.params).id);
    const input = shareInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return errorResponse("VALIDATION_ERROR", "공유 팀을 다시 선택해 주세요.");

    await saveExpenseShare(id, user, input.data.departmentId);
    revalidatePath("/expenses/team");
    revalidatePath(`/expenses/${id}`);
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    return handleError(error);
  }
}
