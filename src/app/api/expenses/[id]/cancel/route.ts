import { NextRequest, NextResponse } from "next/server";
import { requireAuth, handleError } from "@/lib/api-utils";
import { cancelExpense } from "@/services/expense.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST /api/expenses/[id]/cancel -- cancel an expense (owner only)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;

    const updated = await cancelExpense(id, user.id);

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}
