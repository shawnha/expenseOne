import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, handleError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { expenses, users } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, sum } from "drizzle-orm";
import { getCompanyBySlug } from "@/services/company.service";

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard?period=this_month|3_months|6_months|this_year
// ---------------------------------------------------------------------------

function getPeriodRange(period: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // Support specific month: "2026-03" format
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const year = parseInt(monthMatch[1]);
    const month = parseInt(monthMatch[2]) - 1; // 0-indexed
    const start = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    // Don't go past today
    return { start, end: monthEnd > end ? end : monthEnd };
  }

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
    const companySlug = request.nextUrl.searchParams.get("company");
    const { start, end } = getPeriodRange(period);

    const startStr = start.toISOString();
    const endStr = end.toISOString();

    // Resolve company slug to id
    let companyId: string | null = null;
    if (companySlug) {
      const company = await getCompanyBySlug(companySlug);
      if (company) {
        companyId = company.id;
      }
    }

    // 1. Stats: total amount, pending, approved, rejected (single query)
    const dateConditions = [
      gte(expenses.createdAt, new Date(startStr)),
      lte(expenses.createdAt, new Date(endStr)),
    ];
    if (companyId) {
      dateConditions.push(eq(expenses.companyId, companyId) as ReturnType<typeof gte>);
    }
    const dateFilter = and(...dateConditions);

    const [statsResult] = await db
      .select({
        totalAmount: sum(expenses.amount),
        pendingCount: sql<number>`count(*) filter (where ${expenses.status} = 'SUBMITTED')`,
        approvedCount: sql<number>`count(*) filter (where ${expenses.status} = 'APPROVED')`,
        rejectedCount: sql<number>`count(*) filter (where ${expenses.status} = 'REJECTED')`,
      })
      .from(expenses)
      .where(dateFilter);

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
    const trendConditions = [
      gte(expenses.createdAt, sixMonthsAgo),
      lte(expenses.createdAt, new Date(endStr)),
    ];
    if (companyId) {
      trendConditions.push(eq(expenses.companyId, companyId) as ReturnType<typeof gte>);
    }
    const monthlyTrend = await db
      .select({
        month: sql<string>`to_char(${expenses.createdAt}, 'YYYY-MM')`,
        amount: sum(expenses.amount),
      })
      .from(expenses)
      .where(and(...trendConditions))
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
      .groupBy(users.id, users.name)
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
          totalAmount: Number(statsResult?.totalAmount ?? 0),
          pendingCount: Number(statsResult?.pendingCount ?? 0),
          approvedCount: Number(statsResult?.approvedCount ?? 0),
          rejectedCount: Number(statsResult?.rejectedCount ?? 0),
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
