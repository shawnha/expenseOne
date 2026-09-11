import { getActiveCompanies } from "@/services/company.service";
import { getAuthUser } from "@/lib/supabase/cached";
import { getMyCustomCategories } from "@/services/category.service";
import DepositRequestForm from "./deposit-request-form";

export const dynamic = "force-dynamic";

export default async function DepositRequestPage() {
  const authUser = await getAuthUser();
  const [companies, myCategories] = await Promise.all([
    getActiveCompanies(),
    authUser ? getMyCustomCategories(authUser.id) : Promise.resolve<string[]>([]),
  ]);
  const serialized = companies.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    currency: c.currency ?? "KRW",
  }));

  return <DepositRequestForm initialCompanies={serialized} myCategories={myCategories} />;
}
