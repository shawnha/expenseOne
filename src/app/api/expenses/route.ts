import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth, errorResponse, handleError, validateOrigin, jsonWithCache } from "@/lib/api-utils";
import {
  createExpenseSchema,
  expenseQuerySchema,
} from "@/lib/validations/expense";
import {
  createExpense,
  createCorporateCardExpenseFromStaging,
  getExpenses,
} from "@/services/expense.service";

// ---------------------------------------------------------------------------
// GET /api/expenses -- list expenses (filtered, sorted, paginated)
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = request.nextUrl;

    // Parse query parameters
    const rawQuery: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      rawQuery[key] = value;
    });

    const parsed = expenseQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    // Admin can request all expenses with ownOnly=false
    const ownOnly = parsed.data.ownOnly === "false" && user.role === "ADMIN" ? false : true;
    const result = await getExpenses(parsed.data, user.id, user.role, ownOnly);

    return jsonWithCache(result, 0, 30);
  } catch (err) {
    return handleError(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/expenses -- create expense
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();
    const body = await request.json();

    const parsed = createExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    // Codef prefill 경로: ?stagingId=xxx 가 있으면 트랜잭션 내 INSERT + staging consume
    const stagingId = request.nextUrl.searchParams.get("stagingId");
    if (stagingId && parsed.data.type === "CORPORATE_CARD") {
      const result = await createCorporateCardExpenseFromStaging(
        parsed.data,
        stagingId,
        user.id,
        user.name,
        user.email,
        user.companyId,
      );
      revalidatePath("/");
      revalidatePath("/expenses");
      revalidatePath("/admin/pending");
      return NextResponse.json({ data: result.expense }, { status: 201 });
    }

    // 기존 경로 — 100% 동일 (REGRESSION 보장)
    const expense = await createExpense(parsed.data, user.id, user.name, user.email, user.companyId);

    revalidatePath("/");
    revalidatePath("/expenses");
    revalidatePath("/admin/pending");

    return NextResponse.json({ data: expense }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
