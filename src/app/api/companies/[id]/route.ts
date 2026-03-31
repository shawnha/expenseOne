import { NextRequest, NextResponse } from "next/server";
import {
  requireAdmin,
  errorResponse,
  handleError,
  validateOrigin,
  validateUUID,
} from "@/lib/api-utils";
import { updateCompanySchema } from "@/lib/validations/company";
import { updateCompany } from "@/services/company.service";

// ---------------------------------------------------------------------------
// PATCH /api/companies/[id] — update company (ADMIN only)
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    await requireAdmin();

    const { id } = await params;
    validateUUID(id);

    const body = await request.json();
    const parsed = updateCompanySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const updated = await updateCompany(id, parsed.data);

    if (!updated) {
      return errorResponse("NOT_FOUND", "회사를 찾을 수 없습니다.");
    }

    return NextResponse.json({
      data: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "최소 1개의 활성 회사가 필요합니다.") {
      return errorResponse("VALIDATION_ERROR", err.message);
    }
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
      return errorResponse("VALIDATION_ERROR", "이미 존재하는 회사명 또는 slug입니다.");
    }
    return handleError(err);
  }
}
