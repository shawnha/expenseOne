import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth, errorResponse, handleError, validateOrigin, validateUUID, jsonWithCache } from "@/lib/api-utils";
import { updateExpenseSchema } from "@/lib/validations/expense";
import {
  getExpenseById,
  updateExpense,
  deleteExpense,
} from "@/services/expense.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET /api/expenses/[id] -- expense detail with attachments
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const id = validateUUID((await context.params).id);

    const expense = await getExpenseById(id, user.id, user.role);

    return jsonWithCache({ data: expense }, 0, 30);
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/expenses/[id] -- update expense
// ---------------------------------------------------------------------------
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();
    const id = validateUUID((await context.params).id);
    const body = await request.json();

    const parsed = updateExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const updated = await updateExpense(id, parsed.data, user.id, user.role);

    revalidatePath("/");
    revalidatePath("/expenses");
    revalidatePath("/admin/pending");

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/expenses/[id] -- delete expense
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();
    const id = validateUUID((await context.params).id);

    await deleteExpense(id, user.id, user.role);

    revalidatePath("/");
    revalidatePath("/expenses");
    revalidatePath("/admin/pending");

    return NextResponse.json({ data: { success: true } });
  } catch (err) {
    return handleError(err);
  }
}
