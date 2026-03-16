import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, errorResponse, handleError, validateOrigin } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { users, expenses, notifications, attachments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
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
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

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

// ---------------------------------------------------------------------------
// DELETE /api/admin/users -- delete a user and all related data
// Body: { userId: string }
// ---------------------------------------------------------------------------

const deleteUserSchema = z.object({
  userId: z.string().uuid("올바른 사용자 ID를 입력해주세요"),
});

export async function DELETE(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const admin = await requireAdmin();

    const body = await request.json();
    const parsed = deleteUserSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const { userId } = parsed.data;

    if (userId === admin.id) {
      return errorResponse("FORBIDDEN", "자신의 계정은 삭제할 수 없습니다.");
    }

    // Check user exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId));

    if (!existingUser) {
      return errorResponse("NOT_FOUND", "사용자를 찾을 수 없습니다.");
    }

    // Delete user and all related data in a transaction
    await db.transaction(async (tx) => {
      // Get user's expense IDs for notification cleanup
      const userExpenses = await tx
        .select({ id: expenses.id })
        .from(expenses)
        .where(eq(expenses.submittedById, userId));

      const expenseIds = userExpenses.map((e) => e.id);

      // Delete notifications for the user (as recipient)
      await tx.delete(notifications).where(eq(notifications.recipientId, userId));

      // Delete notifications related to user's expenses
      if (expenseIds.length > 0) {
        await tx
          .delete(notifications)
          .where(inArray(notifications.relatedExpenseId, expenseIds));
      }

      // Nullify approvedById on expenses approved by this user
      await tx
        .update(expenses)
        .set({ approvedById: null })
        .where(eq(expenses.approvedById, userId));

      // Delete expenses (attachments cascade automatically)
      await tx.delete(expenses).where(eq(expenses.submittedById, userId));

      // Delete user
      await tx.delete(users).where(eq(users.id, userId));
    });

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    return handleError(err);
  }
}
