import { getActiveCompanies } from "@/services/company.service";
import { db } from "@/lib/db";
import { codefTransactionsStaging } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/api-utils";
import CorporateCardForm from "./corporate-card-form";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ stagingId?: string }>;
}

function ymdFromCompact(yyyymmdd: string): string | null {
  if (!/^\d{8}$/.test(yyyymmdd)) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export default async function CorporateCardPage({ searchParams }: PageProps) {
  const companies = await getActiveCompanies();
  const serialized = companies.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    currency: c.currency,
  }));

  // Codef prefill 경로 — ?stagingId=xxx 가 있으면 staging row 조회
  const params = await searchParams;
  let prefillData: {
    amount: number;
    merchantName: string | null;
    transactionDate: string;
    stagingId: string;
  } | null = null;

  if (params.stagingId) {
    const user = await requireAuth();
    const [row] = await db
      .select()
      .from(codefTransactionsStaging)
      .where(
        and(
          eq(codefTransactionsStaging.id, params.stagingId),
          eq(codefTransactionsStaging.userId, user.id),
          eq(codefTransactionsStaging.status, "pending"),
        ),
      );

    if (row && row.currency === "KRW" && !row.isOverseas) {
      const txDate = ymdFromCompact(row.resApprovalDate);
      if (txDate) {
        prefillData = {
          amount: row.amount,
          merchantName: row.merchantName,
          transactionDate: txDate,
          stagingId: row.id,
        };
      }
    }
    // 잘못된/타유저/이미 consumed → prefillData=null → 빈 폼으로 폴백 (조용히)
  }

  return <CorporateCardForm initialCompanies={serialized} prefillData={prefillData} />;
}
