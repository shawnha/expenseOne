import { getActiveCompanies } from "@/services/company.service";
import { getAuthUser, getCachedCurrentUser } from "@/lib/supabase/cached";
import { getRecurringPrefill } from "@/services/recurring-expense.service";
import { getMyCustomCategories } from "@/services/category.service";
import { getMyRecentPayees } from "@/services/autofill.service";
import DepositRequestForm from "./deposit-request-form";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DepositRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ occurrence?: string | string[]; plan?: string | string[] }>;
}) {
  const authUser = await getAuthUser();
  const { occurrence, plan } = await searchParams;
  // 계획 서비스는 import 하지 않는다 — 일반 입금요청 화면이 계획 DB 풀을 올리면 안 된다. 폼이 HTTP 로 읽는다.
  const planId = typeof plan === "string" && UUID_RE.test(plan) ? plan : undefined;
  const occurrenceId = typeof occurrence === "string" && UUID_RE.test(occurrence) ? occurrence : null;
  const prefillPromise = (async () => {
    if (!occurrenceId) return null;
    const me = await getCachedCurrentUser();
    if (!me) return null;
    return getRecurringPrefill(occurrenceId, { id: me.id, role: me.role });
  })();
  const [companies, myCategories, myPayees, recurringPrefill] = await Promise.all([
    getActiveCompanies(),
    authUser ? getMyCustomCategories(authUser.id) : Promise.resolve<string[]>([]),
    authUser ? getMyRecentPayees(authUser.id) : Promise.resolve([]),
    prefillPromise,
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
      recurringPrefill={recurringPrefill}
      planId={planId}
    />
  );
}
