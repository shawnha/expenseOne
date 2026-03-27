import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { cancelExpense } from "@/services/expense.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST /api/expenses/[id]/cancel -- cancel an expense (owner only)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireAuth();
    const id = validateUUID((await context.params).id);

    const updated = await cancelExpense(id, user.id);

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}
