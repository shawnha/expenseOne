import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAuth, errorResponse, handleError, validateOrigin, validateUUID, jsonWithCache } from "@/lib/api-utils";
import {
  createExpenseSchema,
  expenseQuerySchema,
} from "@/lib/validations/expense";
import {
  createExpense,
  createRefund,
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

    // 반복 지급 알림에서 들어온 폼(?occurrence=…)이면 그 회차에 붙인다. 이미 올라간 회차면 막는다.
    const occurrenceId =
      parsed.data.type === "DEPOSIT_REQUEST" && typeof body?.recurringOccurrenceId === "string"
        ? validateUUID(body.recurringOccurrenceId)
        : null;
    // 계획 DB 풀(plans-client)은 이 경로에서만 필요하다 — 평소 입금요청 제출엔 불러오지 않는다(결합 검토 P6).
    const recurring = occurrenceId ? await import("@/services/recurring-expense.service") : null;
    if (occurrenceId && recurring) await recurring.reserveOccurrenceForSubmit(occurrenceId, { id: user.id, role: user.role });

    let expense: Awaited<ReturnType<typeof createExpense>>;
    try {
      expense =
        parsed.data.type === "REFUND"
          ? await createRefund(parsed.data, user.id, user.role, user.name, user.email)
          : await createExpense(parsed.data, user.id, user.name, user.email, user.companyId);
    } catch (err) {
      if (occurrenceId && recurring) await recurring.releaseOccurrenceReservation(occurrenceId);
      throw err;
    }

    if (occurrenceId && recurring && expense.id) await recurring.attachSubmittedExpense(occurrenceId, expense.id, user.id);

    revalidatePath("/");
    revalidatePath("/expenses");
    revalidatePath("/admin/pending");

    // After expense creation, consume GoWid staging if present
    const url = new URL(request.url);
    const gowidTxId = url.searchParams.get("gowidTxId");
    if (gowidTxId && expense.id) {
      const { consumeGowidTransaction } = await import("@/services/gowid.service");
      await consumeGowidTransaction(gowidTxId, expense.id).catch((err) =>
        console.error("[GoWid] consume staging failed:", err),
      );
    }

    return NextResponse.json({ data: expense }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
