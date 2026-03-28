import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin, handleError, validateOrigin, validateUUID, errorResponse } from "@/lib/api-utils";
import { approveExpense, rejectExpense } from "@/services/expense.service";
import { z } from "zod";

const bulkActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  expenseIds: z.array(z.string()).min(1, "최소 1건을 선택해주세요."),
  rejectionReason: z.string().optional(),
}).refine(
  (data) => data.action !== "reject" || (data.rejectionReason && data.rejectionReason.trim().length > 0),
  { message: "반려 사유를 입력해주세요.", path: ["rejectionReason"] },
);

// ---------------------------------------------------------------------------
// POST /api/expenses/bulk-action -- bulk approve/reject (ADMIN only)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const admin = await requireAdmin();
    const body = await request.json();

    const parsed = bulkActionSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const { action, expenseIds, rejectionReason } = parsed.data;

    // Validate all UUIDs first
    for (const id of expenseIds) {
      validateUUID(id);
    }

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process sequentially to trigger notifications per expense
    for (const id of expenseIds) {
      try {
        if (action === "approve") {
          await approveExpense(id, admin.id);
        } else {
          await rejectExpense(id, admin.id, rejectionReason!.trim());
        }
        success++;
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : "알 수 없는 오류";
        errors.push(`${id}: ${message}`);
      }
    }

    revalidatePath("/");
    revalidatePath("/expenses");
    revalidatePath("/admin/pending");

    return NextResponse.json({ data: { success, failed, errors } });
  } catch (err) {
    return handleError(err);
  }
}
