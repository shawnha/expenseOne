import { getActiveCompanies } from "@/services/company.service";
import { getAuthUser, getCachedCurrentUser } from "@/lib/supabase/cached";
import { getMyCustomCategories } from "@/services/category.service";
import { CARD_BATCH_MAX } from "@/lib/card-batch/types";
import CardBatchForm from "./card-batch-form";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

export default async function CardBatchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { from, plan, ids } = await searchParams;
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
      planId={typeof plan === "string" && UUID_RE.test(plan) ? plan : undefined}
      initialIds={typeof ids === "string" ? [...new Set(ids.split(",").filter((id) => UUID_RE.test(id)).map((id) => id.toLowerCase()))].slice(0, CARD_BATCH_MAX) : undefined}
    />;
}
