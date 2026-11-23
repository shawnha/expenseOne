import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { companies, departments, expenseTeamMembers, users } from "@/lib/db/schema";
import { ExpenseTeamMembershipForm } from "./membership-form";

export default async function ExpenseTeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "ADMIN") notFound();

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const [[user], teamOptions, memberships] = await Promise.all([
    db.select({ name: users.name }).from(users).where(eq(users.id, id.data)),
    db.select({ id: departments.id, name: departments.name, companyName: companies.name })
      .from(departments)
      .innerJoin(companies, eq(companies.id, departments.companyId))
      .where(eq(companies.isActive, true))
      .orderBy(asc(companies.name), asc(departments.sortOrder), asc(departments.name)),
    db.select({ id: expenseTeamMembers.departmentId }).from(expenseTeamMembers)
      .where(eq(expenseTeamMembers.userId, id.data)),
  ]);
  if (!user) notFound();

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Link href="/admin/users" className="self-start text-sm text-[var(--apple-blue)]">사용자 관리</Link>
      <div>
        <h1 className="text-title3 text-[var(--apple-label)]">{user.name}님의 비용 조회 팀</h1>
        <p className="mt-1 text-sm text-[var(--apple-secondary-label)]">
          같은 팀으로 지정된 사용자끼리 비용을 조회할 수 있습니다. 소속이 여러 곳이면 모두 선택하세요.
        </p>
      </div>
      <ExpenseTeamMembershipForm
        userId={id.data}
        options={teamOptions}
        selectedIds={memberships.map((membership) => membership.id)}
      />
    </div>
  );
}
