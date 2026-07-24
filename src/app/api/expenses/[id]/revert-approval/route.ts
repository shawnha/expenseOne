import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin, handleError, validateOrigin, validateUUID } from "@/lib/api-utils";
import { revertApproval } from "@/services/expense.service";

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// POST /api/expenses/[id]/revert-approval -- revert an approved deposit request back to SUBMITTED (ADMIN only)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    await requireAdmin();
    const id = validateUUID((await context.params).id);

    const updated = await revertApproval(id);

    revalidatePath("/");
    revalidatePath("/expenses");
    revalidatePath("/admin/pending");
    revalidatePath("/admin/expenses");

    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleError(err);
  }
}
