import Link from "next/link";
import { getSettlementCompanies } from "@/services/brand-settlement.service";

export function SettlementTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} prefetch={false}
      className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-medium ${active
        ? "bg-[var(--apple-blue)] text-white"
        : "text-[var(--apple-secondary-label)] hover:bg-[var(--apple-tertiary-system-fill)]"}`}>
      {children}
    </Link>
  );
}

export function ExpenseReviewNavigation({ active = false }: { active?: boolean }) {
  return (
    <nav aria-label="비용 목록 보기" className="flex w-fit gap-1 rounded-full border border-[var(--apple-separator)] p-1">
      <SettlementTab href="/expenses" active={!active}>내 비용</SettlementTab>
      <SettlementTab href="/expenses?view=settlements" active={active}>정산 보기</SettlementTab>
    </nav>
  );
}

export async function SettlementReviewLink({ userId }: { userId: string }) {
  const companies = await getSettlementCompanies(userId);
  return companies.length === 0 ? null : <ExpenseReviewNavigation />;
}
