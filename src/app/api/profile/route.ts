import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAuth, errorResponse, handleError, validateOrigin } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const updateProfileSchema = z.object({
  name: z
    .string()
    .min(1, "이름을 입력해주세요")
    .max(100, "이름은 100자 이내로 입력해주세요")
    .optional(),
  cardLastFour: z
    .string()
    .regex(/^\d{4}$/, "카드 끝 4자리 숫자를 입력해주세요")
    .optional()
    .or(z.literal("")),
  department: z
    .string()
    .max(100, "부서명은 100자 이내로 입력해주세요")
    .optional()
    .or(z.literal(""))
    .or(z.null()),
  companyId: z
    .string()
    .uuid("잘못된 회사 ID 형식입니다.")
    .optional()
    .or(z.null()),
});

// ---------------------------------------------------------------------------
// GET /api/profile -- get own profile (companyId, etc.)
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const user = await requireAuth();

    const [profile] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        department: users.department,
        companyId: users.companyId,
      })
      .from(users)
      .where(eq(users.id, user.id));

    if (!profile) {
      return errorResponse("NOT_FOUND", "프로필을 찾을 수 없습니다.");
    }

    return NextResponse.json({ data: profile });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/profile -- update own profile (name, cardLastFour)
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireAuth();
    const body = await request.json();

    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const { name, cardLastFour, department, companyId } = parsed.data;

    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    // Only update name if it was provided in the request
    if (name !== undefined) {
      updateData.name = name;
    }

    // Only update cardLastFour if it was provided in the request
    if (cardLastFour !== undefined) {
      updateData.cardLastFour = cardLastFour || null;
    }

    // Only update department if it was provided in the request
    if (department !== undefined) {
      updateData.department = department || null;
    }

    // 회사 변경: 첫 설정(null→값)은 누구나 가능, 이후 변경은 ADMIN만
    if (companyId !== undefined) {
      const [currentProfile] = await db
        .select({ companyId: users.companyId })
        .from(users)
        .where(eq(users.id, user.id));

      if (currentProfile?.companyId && user.role !== "ADMIN") {
        return errorResponse("FORBIDDEN", "회사 변경은 관리자만 가능합니다.");
      }
      updateData.companyId = companyId || null;
    }

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        name: users.name,
        cardLastFour: users.cardLastFour,
        department: users.department,
      });

    revalidatePath("/");
    revalidatePath("/settings");
    revalidateTag("user-profile", { expire: 0 });

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}
