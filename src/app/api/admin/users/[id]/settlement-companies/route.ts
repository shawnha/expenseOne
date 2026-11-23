import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, handleError, requireAdmin, validateOrigin, validateUUID } from "@/lib/api-utils";
import { saveSettlementViewerCompanies } from "@/services/brand-settlement.service";

const companiesInput = z.object({
  companyIds: z.array(z.uuid()).max(100),
  accessRole: z.enum(["MEMBER", "LEADER", "ADMIN"]).optional(),
}).strict();

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const originError = validateOrigin(request);
    if (originError) return originError;
    const admin = await requireAdmin();

    const id = validateUUID((await context.params).id);
    const input = companiesInput.safeParse(await request.json().catch(() => null));
    if (!input.success) return errorResponse("VALIDATION_ERROR", "법인을 다시 선택해 주세요.");

    const { accessRole, companyIds } = input.data;
    if (accessRole && id === admin.id) {
      return errorResponse("FORBIDDEN", "자신의 역할은 변경할 수 없습니다.");
    }
    if (accessRole === "LEADER" && companyIds.length === 0) {
      return errorResponse("VALIDATION_ERROR", "리더가 조회할 법인을 한 곳 이상 선택해 주세요.");
    }
    if ((accessRole === "MEMBER" || accessRole === "ADMIN") && companyIds.length > 0) {
      return errorResponse("VALIDATION_ERROR", "리더의 담당 법인만 지정할 수 있습니다.");
    }
    const role = accessRole === "LEADER" ? "MEMBER" : accessRole;
    await saveSettlementViewerCompanies(id, [...new Set(companyIds)], admin.id, role);
    if (role) revalidateTag("user-profile", { expire: 0 });
    revalidatePath("/expenses");
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${id}/settlement-companies`);
    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    return handleError(error);
  }
}
