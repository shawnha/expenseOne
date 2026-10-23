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

    // 알림으로 연 법카 폼(?gowidTxId=)이면 비용을 만들기 **전에** 그 결제를 잡는다 — 이미 다른 경로(한 번에
    // 올리기 등)로 올라간 결제면 여기서 멈춘다. 예전엔 비용을 먼저 만들고 나중에 consume 해서 두 번 올라갔다.
    const gowidTxIdParam = new URL(request.url).searchParams.get("gowidTxId");
    const gowidTxId =
      gowidTxIdParam && parsed.data.type === "CORPORATE_CARD" ? validateUUID(gowidTxIdParam) : null;
    const gowid = gowidTxId ? await import("@/services/gowid.service") : null;
    if (gowidTxId && gowid && !(await gowid.claimGowidTransactionForSubmit(gowidTxId, user.id))) {
      return errorResponse("VALIDATION_ERROR", "이미 올린 결제입니다. 비용 목록에서 확인해주세요.");
    }

    let expense: Awaited<ReturnType<typeof createExpense>>;
    try {
      expense =
        parsed.data.type === "REFUND"
          ? await createRefund(parsed.data, user.id, user.role, user.name, user.email)
          : await createExpense(parsed.data, user.id, user.name, user.email, user.companyId);
    } catch (err) {
      if (gowidTxId && gowid) await gowid.releaseGowidClaim(gowidTxId).catch(() => {});
      throw err;
    }

    revalidatePath("/");
    revalidatePath("/expenses");
    revalidatePath("/admin/pending");

    // 잡아 둔 고위드 거래에 만든 비용을 단다 (비용은 이미 있으니 실패해도 되돌리지 않는다)
    if (gowidTxId && gowid && expense.id) {
      await gowid.linkGowidTransaction(gowidTxId, expense.id).catch((err) =>
        console.error("[GoWid] link staging failed:", err instanceof Error ? err.name : "unknown"),
      );
    }

    return NextResponse.json({ data: expense }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
