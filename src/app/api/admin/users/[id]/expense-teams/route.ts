import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, handleError, requireAdmin, validateOrigin, validateUUID } from "@/lib/api-utils";
import { saveExpenseTeams } from "@/services/team-expense.service";

const membershipInput = z.object({ departmentIds: z.array(z.uuid()).max(100) }).strict();

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originError = validateOrigin(request);
    if (originError) return originError;
    await requireAdmin();

    const id = validateUUID((await context.params).id);
    const input = membershipInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return errorResponse("VALIDATION_ERROR", "팀을 다시 선택해 주세요.");

    await saveExpenseTeams(id, [...new Set(input.data.departmentIds)]);
    revalidatePath("/expenses/team");
    revalidatePath(`/admin/users/${id}/expense-teams`);
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    return handleError(error);
  }
}
