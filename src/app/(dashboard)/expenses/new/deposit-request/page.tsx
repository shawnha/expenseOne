import { getActiveCompanies } from "@/services/company.service";
import { getAuthUser, getCachedCurrentUser } from "@/lib/supabase/cached";
import { getRecurringPrefill } from "@/services/recurring-expense.service";
import { getMyCustomCategories } from "@/services/category.service";
import { getMyRecentPayees } from "@/services/autofill.service";
import { getResubmitSource } from "@/services/resubmit.service";
import { resubmitDueDate } from "@/lib/deposit-prefill";
import { todayKST } from "@/lib/plans/pick-ui";
import DepositRequestForm from "./deposit-request-form";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DepositRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ occurrence?: string | string[]; plan?: string | string[]; from?: string | string[] }>;
}) {
  const authUser = await getAuthUser();
  const { occurrence, plan, from } = await searchParams;
  const occurrenceId = typeof occurrence === "string" && UUID_RE.test(occurrence) ? occurrence : null;
  // 반려된 내 입금요청 「이 내용으로 다시 올리기」(?from=). 반복 회차와 같이 오면 회차가 우선한다.
  const fromId = !occurrenceId && typeof from === "string" && UUID_RE.test(from) ? from : null;
  // 계획 서비스는 import 하지 않는다 — 일반 입금요청 화면이 계획 DB 풀을 올리면 안 된다. 폼이 HTTP 로 읽는다.
  // 다시 올리기는 계획을 미리 고르지 않는다(사람이 다시 고른다).
  const planId = !fromId && typeof plan === "string" && UUID_RE.test(plan) ? plan : undefined;
  const prefillPromise = (async () => {
    if (!occurrenceId) return null;
    const me = await getCachedCurrentUser();
    if (!me) return null;
    return getRecurringPrefill(occurrenceId, { id: me.id, role: me.role });
  })();
  const [companies, myCategories, myPayees, recurringPrefill, resubmitSource] = await Promise.all([
    getActiveCompanies(),
    authUser ? getMyCustomCategories(authUser.id) : Promise.resolve<string[]>([]),
    authUser ? getMyRecentPayees(authUser.id) : Promise.resolve([]),
    prefillPromise,
    authUser && fromId ? getResubmitSource(fromId, authUser.id) : Promise.resolve(null),
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
      resubmit={
        recurringPrefill || !resubmitSource
          ? null
          : // 지난 납기일로 다시 올리면 바로 「기한 지남」이 된다 — 오늘(KST) 이전이면 비운다. 서버에서 정해 화면과 어긋나지 않게.
            { ...resubmitSource, dueDate: resubmitDueDate(resubmitSource.dueDate, todayKST()) }
      }
      planId={planId}
    />
  );
}
