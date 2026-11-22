import { db } from "@/lib/db";
import { expenses, users } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, type SQL } from "drizzle-orm";
import { signedAmount, spendType, isSpend } from "@/lib/db/amount";
import { getPeriodRange, trendStart } from "@/lib/admin/dashboard-period";
import { getCompanyBySlug } from "@/services/company.service";

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard?period=YYYY-MM|3_months|6_months|this_year
//
// 금액은 «실제로 나간 돈»만 — 승인된 건, 반품은 원거래 유형 쪽에서 뺀다(isSpend·spendType).
// 그래서 card + deposit = total 이 항상 맞는다.
// 「처리할 일」(승인 대기·후지급)은 기간과 상관없이 지금 남은 전부를 센다.
// ---------------------------------------------------------------------------

// 합계 식 자체에 isSpend를 넣는다 — where에 isSpend가 없는 조회(아래 statsQuery)에서도 대기·반려가 섞이지 않게.
const CARD = sql`${isSpend} and ${spendType} = 'CORPORATE_CARD'`;
const DEPOSIT = sql`${isSpend} and ${spendType} = 'DEPOSIT_REQUEST'`;
const cardSum = sql<string>`coalesce(sum(${signedAmount}) filter (where ${CARD}), 0)`;
const depositSum = sql<string>`coalesce(sum(${signedAmount}) filter (where ${DEPOSIT}), 0)`;

export async function getAdminDashboardData(period: string, companySlug: string | null) {
  const { startDate, endDate } = getPeriodRange(period);

  let companyId: string | null = null;
  if (companySlug) {
    const company = await getCompanyBySlug(companySlug);
    if (company) companyId = company.id;
  }
  const companyCond: SQL[] = companyId ? [eq(expenses.companyId, companyId)] : [];

  const inPeriod = and(
    gte(expenses.transactionDate, startDate),
    lte(expenses.transactionDate, endDate),
    ...companyCond,
  );
  const spendInPeriod = and(inPeriod, isSpend);

  // 1. 기간 안 지출·건수
  const statsQuery = db
    .select({
      cardAmount: cardSum,
      depositAmount: depositSum,
      cardCount: sql<number>`count(*) filter (where ${isSpend} and ${expenses.type} = 'CORPORATE_CARD')`,
      depositApprovedCount: sql<number>`count(*) filter (where ${isSpend} and ${expenses.type} = 'DEPOSIT_REQUEST')`,
      depositRejectedCount: sql<number>`count(*) filter (where ${expenses.type} = 'DEPOSIT_REQUEST' and ${expenses.status} = 'REJECTED')`,
    })
    .from(expenses)
    .where(inPeriod);

  // 2. 처리할 일 — 기간 무관(지난달에 올라와 아직 대기인 건도 할 일이다)
  const todoQuery = db
    .select({
      // 「승인 대기」 화면과 같은 기준(입금요청 · SUBMITTED). 법카·반품은 SUBMITTED가 생기지 않는다.
      pendingCount: sql<number>`count(*) filter (where ${expenses.type} = 'DEPOSIT_REQUEST' and ${expenses.status} = 'SUBMITTED')`,
      // 후지급 요청 대기 — status가 이미 APPROVED라 SUBMITTED로는 안 잡힌다.
      remainingRequestCount: sql<number>`count(*) filter (
        where ${expenses.status} = 'APPROVED'
          and ${expenses.isPrePaid} = true
          and ${expenses.remainingPaymentRequested} = true
          and ${expenses.remainingPaymentApproved} = false
      )`,
    })
    .from(expenses)
    .where(companyCond.length ? and(...companyCond) : undefined);

  // 3. 카테고리별(유형 나눔)
  const categoryQuery = db
    .select({ category: expenses.category, card: cardSum, deposit: depositSum })
    .from(expenses)
    .where(spendInPeriod)
    .groupBy(expenses.category);

  // 4. 월별 추이(기간 시작 달 포함 6개월, 유형 나눔)
  const monthExpr = sql<string>`to_char(${expenses.transactionDate}::date, 'YYYY-MM')`;
  const trendQuery = db
    .select({ month: monthExpr, card: cardSum, deposit: depositSum })
    .from(expenses)
    .where(
      and(
        gte(expenses.transactionDate, trendStart(startDate)),
        lte(expenses.transactionDate, endDate),
        ...companyCond,
        isSpend,
      ),
    )
    .groupBy(monthExpr)
    .orderBy(monthExpr);

  // 5. 팀원별(유형 나눔) — 인원이 적어 전부 보내고 화면이 탭별 상위 5명을 고른다.
  const submitterQuery = db
    .select({ id: users.id, name: users.name, card: cardSum, deposit: depositSum })
    .from(expenses)
    .innerJoin(users, eq(expenses.submittedById, users.id))
    .where(spendInPeriod)
    .groupBy(users.id, users.name)
    .limit(500);

  const [[s], [todo], categoryRows, trendRows, submitterRows] = await Promise.all([
    statsQuery,
    todoQuery,
    categoryQuery,
    trendQuery,
    submitterQuery,
  ]);

  const cardAmount = Number(s?.cardAmount ?? 0);
  const depositAmount = Number(s?.depositAmount ?? 0);
  const depositApprovedCount = Number(s?.depositApprovedCount ?? 0);
  const depositRejectedCount = Number(s?.depositRejectedCount ?? 0);

  const categoryBreakdown = categoryRows
    .map((c) => {
      const card = Number(c.card ?? 0);
      const deposit = Number(c.deposit ?? 0);
      return { category: c.category, label: c.category, card, deposit, amount: card + deposit };
    })
    .sort((a, b) => b.amount - a.amount);

  const monthlyTrend = trendRows.map((m) => {
    const card = Number(m.card ?? 0);
    const deposit = Number(m.deposit ?? 0);
    const [, monthPart] = (m.month ?? "").split("-");
    return { month: m.month, label: `${parseInt(monthPart ?? "0", 10)}월`, card, deposit, amount: card + deposit };
  });

  const submitters = submitterRows
    .map((r) => {
      const card = Number(r.card ?? 0);
      const deposit = Number(r.deposit ?? 0);
      return { id: r.id, name: r.name, card, deposit, amount: card + deposit };
    })
    .sort((a, b) => b.amount - a.amount);

  return {
    range: { startDate, endDate },
    stats: {
      totalAmount: cardAmount + depositAmount,
      cardAmount,
      depositAmount,
      cardCount: Number(s?.cardCount ?? 0),
      depositApprovedCount,
      depositRejectedCount,
      pendingCount: Number(todo?.pendingCount ?? 0),
      remainingRequestCount: Number(todo?.remainingRequestCount ?? 0),
      // 예전 화면(배포 직후 캐시된 PWA)용 — 승인·반려는 입금요청만 뜻이 있다.
      approvedCount: depositApprovedCount,
      rejectedCount: depositRejectedCount,
    },
    categoryBreakdown,
    monthlyTrend,
    submitters,
    topSubmitters: submitters.slice(0, 5).map((x) => ({ name: x.name, amount: x.amount })),
  };
}

export type AdminDashboardData = Awaited<ReturnType<typeof getAdminDashboardData>>;
