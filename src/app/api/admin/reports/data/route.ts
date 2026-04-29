import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { expenses, users, companies, departments } from "@/lib/db/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// GET /api/admin/reports/data
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = request.nextUrl;

    // Required params
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "startDate와 endDate는 필수입니다." } },
        { status: 400 },
      );
    }

    // Optional params
    const prevStartDate = searchParams.get("prevStartDate");
    const prevEndDate = searchParams.get("prevEndDate");
    const type = searchParams.get("type");
    const companyId = searchParams.get("companyId");
    const department = searchParams.get("department");
    const category = searchParams.get("category");

    // -- Build base conditions for current period --
    function buildConditions(start: string, end: string) {
      const conditions = [
        gte(expenses.transactionDate, start),
        lte(expenses.transactionDate, end),
      ];
      if (type && type !== "ALL") {
        conditions.push(
          eq(expenses.type, type as "CORPORATE_CARD" | "DEPOSIT_REQUEST"),
        );
      }
      if (companyId && companyId !== "ALL") {
        conditions.push(eq(expenses.companyId, companyId));
      }
      if (category && category !== "ALL") {
        conditions.push(eq(expenses.category, category));
      }
      return conditions;
    }

    // Department filter requires join, handled separately per query
    const hasDeptFilter = department && department !== "ALL";

    const currentConditions = buildConditions(startDate, endDate);

    // Helper: apply department filter via subquery if needed.
    // Match either the legacy string column or the normalized departmentId
    // by joining departments by name in the same company. Both columns are
    // kept in sync by the profile API while the migration finishes.
    function withDeptFilter(conditions: ReturnType<typeof buildConditions>) {
      if (hasDeptFilter) {
        conditions.push(
          sql`${expenses.submittedById} in (
            select u.id from ${users} u
            left join ${departments} d on d.id = u.department_id
            where u.department = ${department} or d.name = ${department}
          )` as ReturnType<typeof eq>,
        );
      }
      return and(...conditions);
    }

    // -----------------------------------------------------------------------
    // 1. Summary stats for current period
    // -----------------------------------------------------------------------
    const [summaryResult] = await db
      .select({
        totalAmount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
        totalCount: sql<number>`count(*)::int`,
        approvedCount: sql<number>`count(*) filter (where ${expenses.status} = 'APPROVED')::int`,
        corporateCardAmount: sql<number>`coalesce(sum(${expenses.amount}) filter (where ${expenses.type} = 'CORPORATE_CARD'), 0)::int`,
        depositRequestAmount: sql<number>`coalesce(sum(${expenses.amount}) filter (where ${expenses.type} = 'DEPOSIT_REQUEST'), 0)::int`,
      })
      .from(expenses)
      .where(withDeptFilter([...currentConditions]));

    const totalAmount = Number(summaryResult.totalAmount);
    const totalCount = Number(summaryResult.totalCount);
    const approvedCount = Number(summaryResult.approvedCount);
    const corporateCardAmount = Number(summaryResult.corporateCardAmount);
    const depositRequestAmount = Number(summaryResult.depositRequestAmount);
    const averageAmount = totalCount > 0 ? Math.round(totalAmount / totalCount) : 0;
    const corporateCardRatio = totalAmount > 0 ? Math.round((corporateCardAmount / totalAmount) * 100) : 0;
    const depositRequestRatio = totalAmount > 0 ? Math.round((depositRequestAmount / totalAmount) * 100) : 0;

    const summary = {
      totalAmount,
      totalCount,
      approvedCount,
      averageAmount,
      corporateCardRatio,
      depositRequestRatio,
    };

    // -----------------------------------------------------------------------
    // 2. Summary stats for previous period (comparison)
    // -----------------------------------------------------------------------
    let comparison = {
      totalAmount: 0,
      approvedCount: 0,
      totalCount: 0,
      averageAmount: 0,
      corporateCardRatio: 0,
    };

    if (prevStartDate && prevEndDate) {
      const prevConditions = buildConditions(prevStartDate, prevEndDate);

      const [prevResult] = await db
        .select({
          totalAmount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
          totalCount: sql<number>`count(*)::int`,
          approvedCount: sql<number>`count(*) filter (where ${expenses.status} = 'APPROVED')::int`,
          corporateCardAmount: sql<number>`coalesce(sum(${expenses.amount}) filter (where ${expenses.type} = 'CORPORATE_CARD'), 0)::int`,
        })
        .from(expenses)
        .where(withDeptFilter([...prevConditions]));

      const prevTotal = Number(prevResult.totalAmount);
      const prevCount = Number(prevResult.totalCount);
      const prevApproved = Number(prevResult.approvedCount);
      const prevCCAmount = Number(prevResult.corporateCardAmount);

      comparison = {
        totalAmount: prevTotal,
        approvedCount: prevApproved,
        totalCount: prevCount,
        averageAmount: prevCount > 0 ? Math.round(prevTotal / prevCount) : 0,
        corporateCardRatio: prevTotal > 0 ? Math.round((prevCCAmount / prevTotal) * 100) : 0,
      };
    }

    // -----------------------------------------------------------------------
    // 3. Monthly trend (grouped by month within current period)
    // -----------------------------------------------------------------------
    const monthlyTrendRows = await db
      .select({
        month: sql<string>`to_char(${expenses.transactionDate}::date, 'YYYY-MM')`,
        amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
      })
      .from(expenses)
      .where(withDeptFilter([...currentConditions]))
      .groupBy(sql`to_char(${expenses.transactionDate}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${expenses.transactionDate}::date, 'YYYY-MM') asc`);

    const monthlyTrend = monthlyTrendRows.map((row) => {
      const monthPart = (row.month ?? "").split("-")[1] ?? "0";
      return {
        month: row.month,
        label: `${parseInt(monthPart)}월`,
        amount: Number(row.amount),
      };
    });

    // -----------------------------------------------------------------------
    // 4. Category breakdown (grouped by category)
    // -----------------------------------------------------------------------
    const categoryRows = await db
      .select({
        category: expenses.category,
        amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(expenses)
      .where(withDeptFilter([...currentConditions]))
      .groupBy(expenses.category)
      .orderBy(sql`sum(${expenses.amount}) desc`);

    const categoryTotal = categoryRows.reduce((acc, r) => acc + Number(r.amount), 0);
    const categoryBreakdown = categoryRows.map((row) => ({
      category: row.category,
      amount: Number(row.amount),
      count: Number(row.count),
      percentage: categoryTotal > 0 ? Math.round((Number(row.amount) / categoryTotal) * 100) : 0,
    }));

    // -----------------------------------------------------------------------
    // 5. Type ratio by month (corporate_card vs deposit_request per month)
    // -----------------------------------------------------------------------
    const typeRatioRows = await db
      .select({
        month: sql<string>`to_char(${expenses.transactionDate}::date, 'YYYY-MM')`,
        corporateCardAmount: sql<number>`coalesce(sum(${expenses.amount}) filter (where ${expenses.type} = 'CORPORATE_CARD'), 0)::int`,
        depositRequestAmount: sql<number>`coalesce(sum(${expenses.amount}) filter (where ${expenses.type} = 'DEPOSIT_REQUEST'), 0)::int`,
      })
      .from(expenses)
      .where(withDeptFilter([...currentConditions]))
      .groupBy(sql`to_char(${expenses.transactionDate}::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(${expenses.transactionDate}::date, 'YYYY-MM') asc`);

    const typeRatio = typeRatioRows.map((row) => {
      const ccAmt = Number(row.corporateCardAmount);
      const drAmt = Number(row.depositRequestAmount);
      const monthTotal = ccAmt + drAmt;
      const monthPart = (row.month ?? "").split("-")[1] ?? "0";
      return {
        month: row.month,
        label: `${parseInt(monthPart)}월`,
        corporateCard: monthTotal > 0 ? Math.round((ccAmt / monthTotal) * 100) : 0,
        depositRequest: monthTotal > 0 ? Math.round((drAmt / monthTotal) * 100) : 0,
        corporateCardAmount: ccAmt,
        depositRequestAmount: drAmt,
      };
    });

    // -----------------------------------------------------------------------
    // 6. Department breakdown — group by departments.id when set, fall back
    // to the legacy string column for unmigrated users. Department names
    // shared across companies stay distinct because departmentId is unique
    // per (company, name).
    // -----------------------------------------------------------------------
    const deptConditions = buildConditions(startDate, endDate);
    if (hasDeptFilter) {
      deptConditions.push(
        sql`(${departments.name} = ${department} OR ${users.department} = ${department})` as ReturnType<typeof eq>,
      );
    }

    const departmentRows = await db
      .select({
        departmentId: users.departmentId,
        deptName: departments.name,
        legacyDeptName: users.department,
        companyName: companies.name,
        amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(expenses)
      .innerJoin(users, eq(expenses.submittedById, users.id))
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .leftJoin(companies, eq(users.companyId, companies.id))
      .where(and(...deptConditions))
      .groupBy(users.departmentId, departments.name, users.department, companies.name)
      .orderBy(sql`sum(${expenses.amount}) desc`);

    const departmentBreakdown = departmentRows.map((row) => {
      const name = row.deptName ?? row.legacyDeptName;
      const display = name
        ? row.companyName
          ? `${name} (${row.companyName})`
          : name
        : "미지정";
      return {
        department: display,
        amount: Number(row.amount),
        count: Number(row.count),
      };
    });

    // -----------------------------------------------------------------------
    // 7. Company comparison (always show all companies, ignore companyId filter)
    // -----------------------------------------------------------------------
    const companyConditions = [
      gte(expenses.transactionDate, startDate),
      lte(expenses.transactionDate, endDate),
    ];
    if (type && type !== "ALL") {
      companyConditions.push(
        eq(expenses.type, type as "CORPORATE_CARD" | "DEPOSIT_REQUEST"),
      );
    }
    if (category && category !== "ALL") {
      companyConditions.push(eq(expenses.category, category));
    }
    if (hasDeptFilter) {
      companyConditions.push(
        sql`${expenses.submittedById} in (
          select u.id from ${users} u
          left join ${departments} d on d.id = u.department_id
          where u.department = ${department} or d.name = ${department}
        )` as ReturnType<typeof eq>,
      );
    }

    const companyRows = await db
      .select({
        companyId: companies.id,
        name: companies.name,
        slug: companies.slug,
        amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
        count: sql<number>`count(${expenses.id})::int`,
      })
      .from(companies)
      .leftJoin(
        expenses,
        and(
          eq(expenses.companyId, companies.id),
          ...companyConditions,
        ),
      )
      .where(eq(companies.isActive, true))
      .groupBy(companies.id, companies.name, companies.slug)
      .orderBy(sql`sum(${expenses.amount}) desc nulls last`);

    const companyComparison = companyRows.map((row) => ({
      companyId: row.companyId,
      name: row.name,
      slug: row.slug,
      amount: Number(row.amount),
      count: Number(row.count),
    }));

    // -----------------------------------------------------------------------
    // 8. Top 5 submitters (join users, limit 5)
    // -----------------------------------------------------------------------
    const topRows = await db
      .select({
        userId: users.id,
        name: users.name,
        profileImageUrl: users.profileImageUrl,
        amount: sql<number>`coalesce(sum(${expenses.amount}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(expenses)
      .innerJoin(users, eq(expenses.submittedById, users.id))
      .where(withDeptFilter([...currentConditions]))
      .groupBy(users.id, users.name, users.profileImageUrl)
      .orderBy(sql`sum(${expenses.amount}) desc`)
      .limit(5);

    const topSubmitters = topRows.map((row) => ({
      userId: row.userId,
      name: row.name,
      profileImageUrl: row.profileImageUrl,
      amount: Number(row.amount),
      count: Number(row.count),
    }));

    // -----------------------------------------------------------------------
    // Response
    // -----------------------------------------------------------------------
    return NextResponse.json({
      data: {
        summary,
        comparison,
        monthlyTrend,
        categoryBreakdown,
        typeRatio,
        departmentBreakdown,
        companyComparison,
        topSubmitters,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
