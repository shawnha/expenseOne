import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { expenses, users, departments, companies } from "@/lib/db/schema";
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

    // Group by departments.id (when set) so two companies with the same
    // department name don't merge. Fall back to the legacy string column
    // for users who haven't been migrated yet, suffixed with the company
    // slug to keep cross-company strings distinct in the UI.
    const rows = await db
      .select({
        departmentId: users.departmentId,
        deptName: departments.name,
        legacyDeptName: users.department,
        companyName: companies.name,
        totalAmount: sum(expenses.amount),
        count: sql<number>`count(*)::int`,
        approvedAmount: sql<number>`coalesce(sum(${expenses.amount}) filter (where ${expenses.status} = 'APPROVED'), 0)::int`,
      })
      .from(expenses)
      .innerJoin(users, eq(expenses.submittedById, users.id))
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .leftJoin(companies, eq(users.companyId, companies.id))
      .where(whereClause)
      .groupBy(users.departmentId, departments.name, users.department, companies.name)
      .orderBy(sql`${sum(expenses.amount)} desc`);

    const data = rows.map((row) => {
      const name = row.deptName ?? row.legacyDeptName;
      const display = name
        ? row.companyName
          ? `${name} (${row.companyName})`
          : name
        : "미지정";
      return {
        department: display,
        departmentId: row.departmentId,
        totalAmount: Number(row.totalAmount ?? 0),
        count: Number(row.count ?? 0),
        approvedAmount: Number(row.approvedAmount ?? 0),
      };
    });

    return NextResponse.json({ data });
  } catch (err) {
    return handleError(err);
  }
}
