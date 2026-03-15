import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, errorResponse, handleError } from "@/lib/api-utils";
import { csvExportQuerySchema } from "@/lib/validations/expense";
import { db } from "@/lib/db";
import { expenses, users } from "@/lib/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import Papa from "papaparse";

// ---------------------------------------------------------------------------
// Category / Status / Type labels for CSV
// ---------------------------------------------------------------------------
const TYPE_LABELS: Record<string, string> = {
  CORPORATE_CARD: "법카사용",
  DEPOSIT_REQUEST: "입금요청",
};

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: "제출됨",
  APPROVED: "승인됨",
  REJECTED: "반려됨",
  CANCELLED: "취소됨",
};

const CATEGORY_LABELS: Record<string, string> = {
  ODD: "ODD",
  MART_PHARMACY: "마트/약국",
  OTHER: "기타",
};

// ---------------------------------------------------------------------------
// GET /api/export/csv -- CSV export (ADMIN only)
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = request.nextUrl;

    // Parse query parameters
    const rawQuery: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      rawQuery[key] = value;
    });

    const parsed = csvExportQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const query = parsed.data;

    // Build WHERE conditions
    const conditions: ReturnType<typeof eq>[] = [];

    if (query.type) {
      conditions.push(eq(expenses.type, query.type));
    }
    if (query.status) {
      conditions.push(eq(expenses.status, query.status));
    }
    if (query.category) {
      conditions.push(eq(expenses.category, query.category));
    }
    if (query.startDate) {
      conditions.push(gte(expenses.transactionDate, query.startDate));
    }
    if (query.endDate) {
      conditions.push(lte(expenses.transactionDate, query.endDate));
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch data
    const rows = await db
      .select({
        expense: expenses,
        submitterName: users.name,
        submitterEmail: users.email,
      })
      .from(expenses)
      .leftJoin(users, eq(expenses.submittedById, users.id))
      .where(whereClause)
      .orderBy(desc(expenses.createdAt));

    // Transform to CSV-friendly rows
    const csvData = rows.map((row) => ({
      "제목": row.expense.title,
      "비용유형": TYPE_LABELS[row.expense.type] ?? row.expense.type,
      "상태": STATUS_LABELS[row.expense.status] ?? row.expense.status,
      "금액(원)": row.expense.amount,
      "카테고리": CATEGORY_LABELS[row.expense.category] ?? row.expense.category,
      "거래일": row.expense.transactionDate,
      "가맹점명": row.expense.merchantName ?? "",
      "카드끝4자리": row.expense.cardLastFour ?? "",
      "은행명": row.expense.bankName ?? "",
      "예금주": row.expense.accountHolder ?? "",
      "계좌번호": row.expense.accountNumber ?? "",
      "긴급": row.expense.isUrgent ? "Y" : "N",
      "선지급": row.expense.isPrePaid ? "Y" : "N",
      "선지급비율": row.expense.prePaidPercentage ?? "",
      "후지급승인": row.expense.remainingPaymentApproved ? "Y" : "N",
      "제출자": row.submitterName ?? "",
      "제출자이메일": row.submitterEmail ?? "",
      "설명": row.expense.description ?? "",
      "반려사유": row.expense.rejectionReason ?? "",
      "제출일": row.expense.createdAt
        ? new Date(row.expense.createdAt).toISOString()
        : "",
    }));

    // Generate CSV with papaparse
    const csv = Papa.unparse(csvData);

    // UTF-8 BOM for Excel Korean compatibility
    const BOM = "\uFEFF";
    const csvWithBom = BOM + csv;

    return new NextResponse(csvWithBom, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="expenses_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
