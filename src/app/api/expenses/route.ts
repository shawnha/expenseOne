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
    // 계획에서 불러온 폼이면 제출 뒤 그 계획에 잇는다(아래). ID 형식은 비용을 만들기 **전에** 검사한다.
    const planId =
      !occurrenceId &&
      (parsed.data.type === "DEPOSIT_REQUEST" || parsed.data.type === "CORPORATE_CARD") &&
      typeof body?.planId === "string"
        ? validateUUID(body.planId)
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

    // 비용계획에서 불러온 폼(?plan=… / 「내 비용계획에서 불러오기」 / 법카 「계획에 연결」)이면 제출한 비용을 그 계획에 잇는다.
    // 연결 규칙(볼 수 있는 계획·같은 법인·본인 비용·중복)은 linkExpenses 한 곳에서 본다. 실패해도 비용은 그대로 둔다.
    let planLinked: boolean | undefined;
    if (planId && expense.id) {
      planLinked = false;
      try {
        const { isCostPlanningAllowed } = await import("@/lib/plans/flag");
        if (await isCostPlanningAllowed(user.id)) {
          const { linkExpenses } = await import("@/services/plan.service");
          const { linkIds } = await linkExpenses({ id: user.id, role: user.role, name: user.name }, planId, [expense.id]);
          planLinked = linkIds.length > 0;
        }
      } catch (err) {
        console.error("[Plans] link after create failed:", err instanceof Error ? err.name : "unknown");
      }
    }

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

    return NextResponse.json(
      { data: planLinked === undefined ? expense : { ...expense, planLinked } },
      { status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}
