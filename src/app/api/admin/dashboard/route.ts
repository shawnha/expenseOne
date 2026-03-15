import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { expenses, users } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, count, sum } from "drizzle-orm";

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard?period=this_month|3_months|6_months|this_year
// ---------------------------------------------------------------------------

function getPeriodRange(period: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  let start: Date;
  switch (period) {
    case "3_months":
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    case "6_months":
      start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      break;
    case "this_year":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case "this_month":
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  return { start, end };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const period = request.nextUrl.searchParams.get("period") ?? "this_month";
    const { start, end } = getPeriodRange(period);

    const startStr = start.toISOString();
    const endStr = end.toISOString();

    // 1. Stats: total amount, pending, approved, rejected
    const dateFilter = and(
      gte(expenses.createdAt, new Date(startStr)),
      lte(expenses.createdAt, new Date(endStr)),
    );

    // Run stat queries in parallel to reduce latency
    const [
      [totalResult],
      [pendingResult],
      [approvedResult],
      [rejectedResult],
    ] = await Promise.all([
      db
        .select({ total: sum(expenses.amount) })
        .from(expenses)
        .where(dateFilter),
      db
        .select({ cnt: count() })
        .from(expenses)
        .where(and(dateFilter, eq(expenses.status, "SUBMITTED"))),
      db
        .select({ cnt: count() })
        .from(expenses)
        .where(and(dateFilter, eq(expenses.status, "APPROVED"))),
      db
        .select({ cnt: count() })
        .from(expenses)
        .where(and(dateFilter, eq(expenses.status, "REJECTED"))),
    ]);

    // 2. Category breakdown
    const categoryBreakdown = await db
      .select({
        category: expenses.category,
        amount: sum(expenses.amount),
      })
      .from(expenses)
      .where(dateFilter)
      .groupBy(expenses.category)
      .orderBy(sql`${sum(expenses.amount)} desc`);

    // 3. Monthly trend (last 6 months)
    const sixMonthsAgo = new Date(
      start.getFullYear(),
      start.getMonth() - 5,
      1,
    );
    const monthlyTrend = await db
      .select({
        month: sql<string>`to_char(${expenses.createdAt}, 'YYYY-MM')`,
        amount: sum(expenses.amount),
      })
      .from(expenses)
      .where(
        and(
          gte(expenses.createdAt, sixMonthsAgo),
          lte(expenses.createdAt, new Date(endStr)),
        ),
      )
      .groupBy(sql`to_char(${expenses.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${expenses.createdAt}, 'YYYY-MM') asc`);

    // 4. Top 5 submitters
    const topSubmitters = await db
      .select({
        name: users.name,
        amount: sum(expenses.amount),
      })
      .from(expenses)
      .innerJoin(users, eq(expenses.submittedById, users.id))
      .where(dateFilter)
      .groupBy(users.name)
      .orderBy(sql`${sum(expenses.amount)} desc`)
      .limit(5);

    // Format monthly trend labels
    const formattedMonthly = monthlyTrend.map((m) => {
      const [, monthPart] = (m.month ?? "").split("-");
      return {
        month: m.month,
        label: `${parseInt(monthPart ?? "0")}월`,
        amount: Number(m.amount ?? 0),
      };
    });

    return NextResponse.json({
      data: {
        stats: {
          totalAmount: Number(totalResult?.total ?? 0),
          pendingCount: pendingResult?.cnt ?? 0,
          approvedCount: approvedResult?.cnt ?? 0,
          rejectedCount: rejectedResult?.cnt ?? 0,
        },
        categoryBreakdown: categoryBreakdown.map((c) => ({
          category: c.category,
          label: c.category,
          amount: Number(c.amount ?? 0),
        })),
        monthlyTrend: formattedMonthly,
        topSubmitters: topSubmitters.map((s) => ({
          name: s.name,
          amount: Number(s.amount ?? 0),
        })),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
