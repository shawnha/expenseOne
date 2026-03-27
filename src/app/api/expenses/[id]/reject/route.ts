import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin, errorResponse, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { rejectExpenseSchema } from "@/lib/validations/expense";
import { rejectExpense } from "@/services/expense.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST /api/expenses/[id]/reject -- reject a deposit request (ADMIN only)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const admin = await requireAdmin();
    const id = validateUUID((await context.params).id);
    const body = await request.json();

    const parsed = rejectExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const updated = await rejectExpense(
      id,
      admin.id,
      parsed.data.rejectionReason,
    );

    revalidatePath("/");
    revalidatePath("/expenses");
    revalidatePath("/admin/pending");

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}
