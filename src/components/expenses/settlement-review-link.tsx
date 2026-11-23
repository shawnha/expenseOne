import Link from "next/link";
import { getSettlementCompanies } from "@/services/brand-settlement.service";

export function SettlementTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} prefetch={false}
      className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-sm font-medium sm:min-h-9 ${active
        ? "bg-[var(--apple-blue)] text-white"
        : "text-[var(--apple-secondary-label)] hover:bg-[var(--apple-tertiary-system-fill)]"}`}>
      {children}
    </Link>
  );
}

export function ExpenseReviewNavigation({ view = "own" }: { view?: "own" | "company" | "settlements" }) {
  return (
    <nav aria-label="비용 목록 보기" className="flex w-fit max-w-full flex-wrap gap-1 rounded-2xl border border-[var(--apple-separator)] p-1">
      <SettlementTab href="/expenses" active={view === "own"}>내 비용</SettlementTab>
      <SettlementTab href="/expenses?view=company" active={view === "company"}>법인 비용</SettlementTab>
      <SettlementTab href="/expenses?view=settlements" active={view === "settlements"}>정산 보기</SettlementTab>
    </nav>
  );
}

export async function SettlementReviewLink({ userId }: { userId: string }) {
  const companies = await getSettlementCompanies(userId);
  return companies.length === 0 ? null : <ExpenseReviewNavigation />;
}
