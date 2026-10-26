import { getActiveCompanies } from "@/services/company.service";
import { getAuthUser, getCachedCurrentUser } from "@/lib/supabase/cached";
import { getMyCustomCategories } from "@/services/category.service";
import CardBatchForm from "./card-batch-form";

export const dynamic = "force-dynamic";

export default async function CardBatchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { from } = await searchParams;
  const authUser = await getAuthUser();
  const [companies, myCategories, me] = await Promise.all([
    getActiveCompanies(),
    authUser ? getMyCustomCategories(authUser.id) : Promise.resolve<string[]>([]),
    getCachedCurrentUser(),
  ]);
  const serialized = companies.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    currency: c.currency,
  }));

  return <CardBatchForm
      initialCompanies={serialized}
      myCategories={myCategories}
      isAdmin={me?.role === "ADMIN"}
      initialFrom={typeof from === "string" ? from : undefined}
    />;
}
