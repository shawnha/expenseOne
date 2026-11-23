import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, handleError, requireAdmin, validateOrigin, validateUUID } from "@/lib/api-utils";
import { isCostPlanningAllowed } from "@/lib/plans/flag";
import { settlementSourceSchema, settlementSubjectSchema } from "@/lib/validations/brand-settlement";
import { saveSettlementSubject } from "@/services/brand-settlement.service";

export async function PUT(request: NextRequest, context: { params: Promise<{ source: string; id: string }> }) {
  try {
    const originError = validateOrigin(request);
    if (originError) return originError;
    const admin = await requireAdmin();

    const params = await context.params;
    const source = settlementSourceSchema.safeParse(params.source);
    if (!source.success) return errorResponse("NOT_FOUND", "정산 대상을 찾을 수 없습니다.");
    const id = validateUUID(params.id);
    if (source.data === "PLAN" && !(await isCostPlanningAllowed(admin.id))) {
      return errorResponse("NOT_FOUND", "비용계획을 찾을 수 없습니다.");
    }
    const input = settlementSubjectSchema.nullable().safeParse(await request.json().catch(() => undefined));
    if (!input.success) return errorResponse("VALIDATION_ERROR", "브랜드명과 정산월을 확인해 주세요.");

    await saveSettlementSubject(source.data, id, admin.id, input.data);
    revalidatePath("/expenses/brand-settlements");
    revalidatePath(source.data === "PLAN" ? `/plans/${id}` : `/expenses/${id}`);
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    return handleError(error);
  }
}
