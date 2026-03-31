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
    .max(100, "이름은 100자 이내로 입력해주세요"),
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
      name,
      cardLastFour: cardLastFour || null,
      updatedAt: new Date(),
    };

    // Only update department if it was provided in the request
    if (department !== undefined) {
      updateData.department = department || null;
    }

    // Only update companyId if it was provided in the request
    if (companyId !== undefined) {
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
