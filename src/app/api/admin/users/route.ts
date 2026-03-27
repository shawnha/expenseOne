import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireAdmin, errorResponse, handleError, validateOrigin } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { users, expenses, notifications, attachments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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

    // Build update object with type safety
    const updateData: Partial<typeof users.$inferInsert> = {
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

    revalidatePath("/");
    revalidatePath("/expenses");
    revalidatePath("/admin/pending");
    revalidateTag("user-profile", { expire: 0 });

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

    // Collect storage file keys before deleting DB records
    const userExpenses = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(eq(expenses.submittedById, userId));

    const expenseIds = userExpenses.map((e) => e.id);

    let fileKeys: string[] = [];
    if (expenseIds.length > 0) {
      const userAttachments = await db
        .select({ fileKey: attachments.fileKey })
        .from(attachments)
        .where(inArray(attachments.expenseId, expenseIds));
      fileKeys = userAttachments.map((a) => a.fileKey);
    }

    // Delete user and all related data in a transaction
    await db.transaction(async (tx) => {
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

    // Clean up storage files (non-blocking)
    if (fileKeys.length > 0) {
      const supabase = await createClient();
      await supabase.storage.from("attachments").remove(fileKeys).catch((err: any) => {
        console.error("Failed to clean up storage files:", err);
      });
    }

    // Delete from Supabase Auth
    try {
      const adminClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      await adminClient.auth.admin.deleteUser(userId);
    } catch (authErr: any) {
      console.error("Failed to delete user from Supabase Auth:", authErr.message);
    }

    revalidatePath("/");
    revalidatePath("/expenses");
    revalidatePath("/admin/pending");
    revalidateTag("user-profile", { expire: 0 });

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    return handleError(err);
  }
}
