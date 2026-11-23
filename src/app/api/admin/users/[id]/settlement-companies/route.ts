import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, handleError, requireAdmin, validateOrigin, validateUUID } from "@/lib/api-utils";
import { saveSettlementViewerCompanies } from "@/services/brand-settlement.service";

const companiesInput = z.object({ companyIds: z.array(z.uuid()).max(100) }).strict();

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originError = validateOrigin(request);
    if (originError) return originError;
    const admin = await requireAdmin();

    const id = validateUUID((await context.params).id);
    const input = companiesInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return errorResponse("VALIDATION_ERROR", "법인을 다시 선택해 주세요.");

    await saveSettlementViewerCompanies(id, [...new Set(input.data.companyIds)], admin.id);
    revalidatePath("/expenses/brand-settlements");
    revalidatePath(`/admin/users/${id}/settlement-companies`);
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    return handleError(error);
  }
}
