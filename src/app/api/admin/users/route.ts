import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, errorResponse, handleError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

// Zod schema for admin user update
const updateUserSchema = z.object({
  userId: z.string().uuid("올바른 사용자 ID를 입력해주세요"),
  role: z.enum(["MEMBER", "ADMIN"], {
    message: "역할은 MEMBER 또는 ADMIN이어야 합니다.",
  }).optional(),
  isActive: z.boolean({
    message: "isActive는 boolean이어야 합니다.",
  }).optional(),
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users -- update user role or isActive
// Body: { userId: string, role?: "MEMBER" | "ADMIN", isActive?: boolean }
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin();

    const body = await request.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const { userId, role, isActive } = parsed.data;

    // Cannot modify self
    if (userId === admin.id) {
      return errorResponse("FORBIDDEN", "자신의 계정은 변경할 수 없습니다.");
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (role !== undefined) {
      updateData.role = role;
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    // Check user exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId));

    if (!existingUser) {
      return errorResponse("NOT_FOUND", "사용자를 찾을 수 없습니다.");
    }

    await db.update(users).set(updateData).where(eq(users.id, userId));

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    return handleError(err);
  }
}
