import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAdmin, errorResponse, handleError, validateOrigin, jsonWithCache } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { departments, users } from "@/lib/db/schema";
import { eq, asc, count } from "drizzle-orm";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const createSchema = z.object({
  name: z
    .string()
    .min(1, "부서명을 입력해주세요")
    .max(100, "부서명은 100자 이내로 입력해주세요"),
  companyId: z.string().uuid("올바른 회사 ID를 입력해주세요"),
});

const updateSchema = z.object({
  id: z.string().uuid("잘못된 ID 형식입니다."),
  name: z
    .string()
    .min(1, "부서명을 입력해주세요")
    .max(100, "부서명은 100자 이내로 입력해주세요"),
  sortOrder: z.number().int().optional(),
});

const deleteSchema = z.object({
  id: z.string().uuid("잘못된 ID 형식입니다."),
});

// ---------------------------------------------------------------------------
// GET /api/departments -- list all departments (any authenticated user)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const companyId = request.nextUrl.searchParams.get("companyId");

    let query = db
      .select({
        id: departments.id,
        name: departments.name,
        sortOrder: departments.sortOrder,
        createdAt: departments.createdAt,
      })
      .from(departments);

    if (companyId) {
      query = query.where(eq(departments.companyId, companyId)) as typeof query;
    }

    const result = await query.orderBy(asc(departments.sortOrder), asc(departments.name));

    const serialized = result.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    }));

    return jsonWithCache({ data: serialized }, 0, 60);
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/departments -- create department (admin only)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    await requireAdmin();
    const body = await request.json();

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    // Get max sort_order to put new department at the end
    const existing = await db
      .select({ sortOrder: departments.sortOrder })
      .from(departments)
      .orderBy(asc(departments.sortOrder));

    const maxSortOrder = existing.length > 0
      ? Math.max(...existing.map((d) => d.sortOrder))
      : 0;

    const [created] = await db
      .insert(departments)
      .values({
        name: parsed.data.name.trim(),
        companyId: parsed.data.companyId,
        sortOrder: maxSortOrder + 1,
      })
      .returning();

    return NextResponse.json(
      { data: { ...created, createdAt: created.createdAt.toISOString() } },
      { status: 201 },
    );
  } catch (err) {
    // Handle unique constraint violation
    if ((err as { code?: string })?.code === "23505") {
      return errorResponse("VALIDATION_ERROR", "이미 존재하는 부서명입니다.");
    }
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/departments -- update department (admin only)
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    await requireAdmin();
    const body = await request.json();

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const updateData: Record<string, unknown> = { name: parsed.data.name.trim() };
    if (parsed.data.sortOrder !== undefined) {
      updateData.sortOrder = parsed.data.sortOrder;
    }

    const [updated] = await db
      .update(departments)
      .set(updateData)
      .where(eq(departments.id, parsed.data.id))
      .returning();

    if (!updated) {
      return errorResponse("NOT_FOUND", "부서를 찾을 수 없습니다.");
    }

    return NextResponse.json({
      data: { ...updated, createdAt: updated.createdAt.toISOString() },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return errorResponse("VALIDATION_ERROR", "이미 존재하는 부서명입니다.");
    }
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/departments -- delete department (admin only)
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    await requireAdmin();
    const body = await request.json();

    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    // Check if any users are assigned to this department
    const [dept] = await db
      .select({ name: departments.name })
      .from(departments)
      .where(eq(departments.id, parsed.data.id));

    if (!dept) {
      return errorResponse("NOT_FOUND", "부서를 찾을 수 없습니다.");
    }

    const [userCount] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.department, dept.name));

    if (userCount && userCount.count > 0) {
      return errorResponse(
        "VALIDATION_ERROR",
        `이 부서에 소속된 사용자가 ${userCount.count}명 있어 삭제할 수 없습니다.`,
      );
    }

    await db.delete(departments).where(eq(departments.id, parsed.data.id));

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    return handleError(err);
  }
}
