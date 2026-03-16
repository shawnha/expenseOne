import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { approveExpense } from "@/services/expense.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST /api/expenses/[id]/approve -- approve a deposit request (ADMIN only)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const admin = await requireAdmin();
    const id = validateUUID((await context.params).id);

    const updated = await approveExpense(id, admin.id);

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}
