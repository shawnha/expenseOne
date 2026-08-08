import { db } from "@/lib/db";
import { companies, expenses, users, departments } from "@/lib/db/schema";
import { asc, count } from "drizzle-orm";
import { CompanyManager, type CompanyRow } from "./company-manager";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// 회사(법인) 관리 — ADMIN 전용. 권한은 admin/layout.tsx에서 이미 걸린다.
//
// 법인을 추가할 때 코드 수정은 필요 없지만 **환경변수는 사람이 넣어야** 한다
// (GOWID_API_KEY_<SLUG> 등). 어디까지 됐는지 화면에서 바로 보이게 연동 상태를
// 같이 내려준다. 값은 절대 보내지 않고 설정 여부(boolean)만 보낸다.
// ---------------------------------------------------------------------------

/** slug → 환경변수 접미사. company-pill-group / slack.service와 같은 규칙. */
function envSuffix(slug: string): string {
  return slug.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

function integrationStatus(slug: string) {
  const suffix = envSuffix(slug);
  // 코리아는 단일 법인 시절 이름이라 접미사가 없다(GOWID_API_KEY).
  const gowid =
    Boolean(process.env[`GOWID_API_KEY_${suffix}`]) ||
    (slug === "korea" && Boolean(process.env.GOWID_API_KEY));
  const slackMirror =
    Boolean(process.env[`SLACK_BOT_TOKEN_${suffix}`]) &&
    Boolean(process.env[`SLACK_CHANNEL_ID_${suffix}`]);
  return { gowid, slackMirror };
}

/** 회사별 사용 건수. 스칼라 서브쿼리는 Drizzle에서 상관관계가 깨져 0이 나와서
 *  회사별 GROUP BY로 따로 집계한 뒤 합친다. */
async function countsByCompany() {
  const [expenseRows, userRows, deptRows] = await Promise.all([
    db
      .select({ companyId: expenses.companyId, n: count() })
      .from(expenses)
      .groupBy(expenses.companyId),
    db
      .select({ companyId: users.companyId, n: count() })
      .from(users)
      .groupBy(users.companyId),
    db
      .select({ companyId: departments.companyId, n: count() })
      .from(departments)
      .groupBy(departments.companyId),
  ]);

  const toMap = (rows: { companyId: string | null; n: number }[]) =>
    new Map(rows.filter((r) => r.companyId).map((r) => [r.companyId!, r.n]));

  return {
    expense: toMap(expenseRows),
    user: toMap(userRows),
    dept: toMap(deptRows),
  };
}

export default async function AdminCompaniesPage() {
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(companies)
      .orderBy(asc(companies.sortOrder), asc(companies.name)),
    countsByCompany(),
  ]);

  const initial: CompanyRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    currency: r.currency,
    slackChannelId: r.slackChannelId,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    expenseCount: counts.expense.get(r.id) ?? 0,
    userCount: counts.user.get(r.id) ?? 0,
    departmentCount: counts.dept.get(r.id) ?? 0,
    ...integrationStatus(r.slug),
  }));

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      <div>
        <h1 className="text-title3 text-[var(--apple-label)]">회사 관리</h1>
        <p className="text-sm text-[var(--apple-secondary-label)]">
          법인을 추가하고 통화·표시 순서·연동 상태를 관리하세요.
        </p>
      </div>
      <CompanyManager initialCompanies={initial} />
    </div>
  );
}
