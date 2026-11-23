import Link from "next/link";
import { getSettlementCompanies } from "@/services/brand-settlement.service";

export async function SettlementReviewLink({ userId }: { userId: string }) {
  const companies = await getSettlementCompanies(userId);
  if (companies.length === 0) return null;
  return (
    <Link href="/expenses/brand-settlements" prefetch={false}
      className="inline-flex min-h-10 items-center self-start rounded-full border border-[var(--apple-separator)] px-4 text-sm font-medium text-[var(--apple-blue)]">
      브랜드 정산
    </Link>
  );
}
