import { getActiveCompanies } from "@/services/company.service";
import { getAuthUser } from "@/lib/supabase/cached";
import { getPendingGowidTransaction } from "@/services/gowid.service";
import CorporateCardForm from "./corporate-card-form";

export const dynamic = "force-dynamic";

interface PrefillData {
  amount: number;
  merchantName: string | null;
  transactionDate: string;
  gowidTxId: string;
  companyId: string | null;
}

export default async function CorporateCardPage({
  searchParams,
}: {
  searchParams: Promise<{ gowidTxId?: string }>;
}) {
  const companies = await getActiveCompanies();
  const serialized = companies.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    currency: c.currency,
  }));

  let prefillData: PrefillData | undefined;
  const params = await searchParams;

  if (params.gowidTxId) {
    const authUser = await getAuthUser();
    if (authUser) {
      const tx = await getPendingGowidTransaction(params.gowidTxId, authUser.id);
      if (tx) {
        const d = tx.expenseDate;
        const dateStr = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
        prefillData = {
          amount: tx.amount,
          merchantName: tx.storeName,
          transactionDate: dateStr,
          gowidTxId: tx.id,
          companyId: tx.mappedCompanyId,
        };
      }
    }
  }

  return (
    <CorporateCardForm
      initialCompanies={serialized}
      prefillData={prefillData}
    />
  );
}
