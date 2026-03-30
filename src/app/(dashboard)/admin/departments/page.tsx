import { db } from "@/lib/db";
import { departments } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { DepartmentManager } from "./department-manager";

export const dynamic = "force-dynamic";

export default async function AdminDepartmentsPage() {
  // DEV ONLY: mock data
  if (process.env.BYPASS_AUTH === "true") {
    const mockDepartments = [
      { id: "1", name: "경영지원", sortOrder: 1, createdAt: "2026-01-01T00:00:00Z" },
      { id: "2", name: "개발팀", sortOrder: 2, createdAt: "2026-01-01T00:00:00Z" },
      { id: "3", name: "디자인팀", sortOrder: 3, createdAt: "2026-01-01T00:00:00Z" },
      { id: "4", name: "마케팅", sortOrder: 4, createdAt: "2026-01-01T00:00:00Z" },
      { id: "5", name: "영업", sortOrder: 5, createdAt: "2026-01-01T00:00:00Z" },
    ];

    return (
      <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">부서 관리</h1>
          <p className="text-sm text-[var(--apple-secondary-label)]">부서를 추가, 수정, 삭제하세요.</p>
        </div>
        <DepartmentManager initialDepartments={mockDepartments} />
      </div>
    );
  }

  const allDepts = await db
    .select({
      id: departments.id,
      name: departments.name,
      sortOrder: departments.sortOrder,
      createdAt: departments.createdAt,
    })
    .from(departments)
    .orderBy(asc(departments.sortOrder), asc(departments.name));

  const serialized = allDepts.map((d) => ({
    ...d,
    createdAt: d.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      <div>
        <h1 className="text-lg sm:text-xl font-semibold text-[var(--apple-label)]">부서 관리</h1>
        <p className="text-sm text-[var(--apple-secondary-label)]">부서를 추가, 수정, 삭제하세요.</p>
      </div>
      <DepartmentManager initialDepartments={serialized} />
    </div>
  );
}
