import { getActiveCompanies } from "@/services/company.service";
import { getAuthUser } from "@/lib/supabase/cached";
import { getMyCustomCategories } from "@/services/category.service";
import { getMyRecentPayees } from "@/services/autofill.service";
import DepositRequestForm from "./deposit-request-form";

export const dynamic = "force-dynamic";

export default async function DepositRequestPage() {
  const authUser = await getAuthUser();
  const [companies, myCategories, myPayees] = await Promise.all([
    getActiveCompanies(),
    authUser ? getMyCustomCategories(authUser.id) : Promise.resolve<string[]>([]),
    authUser ? getMyRecentPayees(authUser.id) : Promise.resolve([]),
  ]);
  const serialized = companies.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    currency: c.currency ?? "KRW",
  }));

  return (
    <DepositRequestForm
      initialCompanies={serialized}
      myCategories={myCategories}
      myPayees={myPayees}
    />
  );
}
