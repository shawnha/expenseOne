import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getActiveCompanies } from "@/services/company.service";
import { getSettlementViewerCompanies } from "@/services/brand-settlement.service";
import { SettlementCompaniesForm } from "./settlement-companies-form";

export default async function SettlementCompaniesPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/login");
  if (admin.role !== "ADMIN") notFound();

  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();

  const [[user], companies, selected] = await Promise.all([
    db.select({ name: users.name, role: users.role }).from(users).where(eq(users.id, id.data)),
    getActiveCompanies(),
    getSettlementViewerCompanies(id.data),
  ]);
  if (!user) notFound();

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <Link href="/admin/users" className="self-start text-sm text-[var(--apple-blue)]">사용자 관리</Link>
      <div>
        <h1 className="text-title3 text-[var(--apple-label)]">{user.name}님의 담당 법인</h1>
        <p className="mt-1 text-sm text-[var(--apple-secondary-label)]">
          비용과 브랜드 정산을 조회할 수 있는 법인을 선택하세요. 여러 법인을 지정할 수 있습니다.
        </p>
        {user.role === "ADMIN" && (
          <p className="mt-1 text-sm text-[var(--apple-secondary-label)]">관리자는 활성 법인을 모두 조회할 수 있습니다.</p>
        )}
      </div>
      <SettlementCompaniesForm
        userId={id.data}
        companies={companies.map(({ id, name }) => ({ id, name }))}
        selectedIds={selected.map(({ companyId }) => companyId)}
      />
      <Link href="/admin/companies" className="self-start text-sm font-medium text-[var(--apple-blue)]">새 법인 등록</Link>
    </div>
  );
}
