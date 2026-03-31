import { db } from "@/lib/db";
import { departments, companies } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import { DepartmentManager } from "./department-manager";
import { AdminCompanyFilter } from "@/components/admin/company-filter";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ company?: string }>;
}

export default async function AdminDepartmentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const companySlug = params.company;

  // Resolve company slug to ID
  let companyId: string | null = null;
  if (companySlug) {
    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.slug, companySlug));
    companyId = company?.id ?? null;
  }

  // DEV ONLY: mock data
  if (process.env.BYPASS_AUTH === "true") {
    const mockDepartments = [
      { id: "1", name: "경영지원", sortOrder: 1, createdAt: "2026-01-01T00:00:00Z", companyId: null, companyName: null, companySlug: null },
      { id: "2", name: "개발팀", sortOrder: 2, createdAt: "2026-01-01T00:00:00Z", companyId: null, companyName: null, companySlug: null },
      { id: "3", name: "디자인팀", sortOrder: 3, createdAt: "2026-01-01T00:00:00Z", companyId: null, companyName: null, companySlug: null },
      { id: "4", name: "마케팅", sortOrder: 4, createdAt: "2026-01-01T00:00:00Z", companyId: null, companyName: null, companySlug: null },
      { id: "5", name: "영업", sortOrder: 5, createdAt: "2026-01-01T00:00:00Z", companyId: null, companyName: null, companySlug: null },
    ];

    return (
      <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">부서 관리</h1>
            <p className="text-sm text-[var(--apple-secondary-label)]">부서를 추가, 수정, 삭제하세요.</p>
          </div>
          <AdminCompanyFilter />
        </div>
        <DepartmentManager initialDepartments={mockDepartments} companyId={null} />
      </div>
    );
  }

  let query = db
    .select({
      id: departments.id,
      name: departments.name,
      sortOrder: departments.sortOrder,
      createdAt: departments.createdAt,
      companyId: departments.companyId,
      companyName: companies.name,
      companySlug: companies.slug,
    })
    .from(departments)
    .leftJoin(companies, eq(departments.companyId, companies.id));

  if (companyId) {
    query = query.where(eq(departments.companyId, companyId)) as typeof query;
  }

  const allDepts = await query.orderBy(asc(departments.sortOrder), asc(departments.name));

  const serialized = allDepts.map((d) => ({
    ...d,
    createdAt: d.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">부서 관리</h1>
          <p className="text-sm text-[var(--apple-secondary-label)]">부서를 추가, 수정, 삭제하세요.</p>
        </div>
        <AdminCompanyFilter />
      </div>
      <DepartmentManager initialDepartments={serialized} companyId={companyId} />
    </div>
  );
}
