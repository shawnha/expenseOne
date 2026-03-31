import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  requireAdmin,
  errorResponse,
  handleError,
  validateOrigin,
  jsonWithCache,
} from "@/lib/api-utils";
import { createCompanySchema } from "@/lib/validations/company";
import {
  getActiveCompanies,
  getAllCompanies,
  createCompany,
} from "@/services/company.service";

// ---------------------------------------------------------------------------
// GET /api/companies — list companies
// Active only by default. If ?all=true and user is ADMIN, returns all.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const showAll = request.nextUrl.searchParams.get("all") === "true";

    const data =
      showAll && user.role === "ADMIN"
        ? await getAllCompanies()
        : await getActiveCompanies();

    const serialized = data.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    return jsonWithCache({ data: serialized }, 0, 60);
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/companies — create company (ADMIN only)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    await requireAdmin();
    const body = await request.json();

    const parsed = createCompanySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const created = await createCompany(parsed.data);

    return NextResponse.json(
      {
        data: {
          ...created,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
      return errorResponse("VALIDATION_ERROR", "이미 존재하는 회사명 또는 slug입니다.");
    }
    return handleError(err);
  }
}
