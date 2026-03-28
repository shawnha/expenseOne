import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { expenses, users } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, sum } from "drizzle-orm";

// ---------------------------------------------------------------------------
// GET /api/admin/reports/department?startDate=&endDate=&type=&status=
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = request.nextUrl;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const type = searchParams.get("type");
    const status = searchParams.get("status");

    // Build filters
    const conditions = [];

    if (startDate) {
      conditions.push(gte(expenses.transactionDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(expenses.transactionDate, endDate));
    }
    if (type && type !== "ALL") {
      conditions.push(eq(expenses.type, type as "CORPORATE_CARD" | "DEPOSIT_REQUEST"));
    }
    if (status && status !== "ALL") {
      conditions.push(
        eq(expenses.status, status as "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED"),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        department: users.department,
        totalAmount: sum(expenses.amount),
        count: sql<number>`count(*)::int`,
        approvedAmount: sql<number>`coalesce(sum(${expenses.amount}) filter (where ${expenses.status} = 'APPROVED'), 0)::int`,
      })
      .from(expenses)
      .innerJoin(users, eq(expenses.submittedById, users.id))
      .where(whereClause)
      .groupBy(users.department)
      .orderBy(sql`${sum(expenses.amount)} desc`);

    const data = rows.map((row) => ({
      department: row.department ?? "미지정",
      totalAmount: Number(row.totalAmount ?? 0),
      count: Number(row.count ?? 0),
      approvedAmount: Number(row.approvedAmount ?? 0),
    }));

    return NextResponse.json({ data });
  } catch (err) {
    return handleError(err);
  }
}
