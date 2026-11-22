import { redirect, unstable_rethrow } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { ExpenseGuideStart } from "@/components/onboarding/expense-task-guide";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { isCostPlanningAllowed } from "@/lib/plans/flag";
import { summarizeError } from "@/lib/plans/errors";
import { listSoonPlans, type SoonPlans } from "@/services/plan-picks.service";
import { NewExpenseChooser } from "./new-expense-chooser";

export const dynamic = "force-dynamic";

async function hasExpenseHistory(userId: string) {
  const rows = await db.select({ id: expenses.id }).from(expenses)
    .where(eq(expenses.submittedById, userId)).limit(1);
  return rows.length > 0;
}

/** 첫 그림 전에 계획을 읽는다 — 늦게 도착한 목록이 법카 카드를 밀지 않게 한다. */
export default async function NewExpensePage() {
  const user = await getCachedCurrentUser();
  if (!user) redirect("/login");
  let plansEnabled: boolean | null = null;
  let soonPlans: SoonPlans | null = null;
  let showGuide = false;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // 계획과 첫 비용 안내를 같은 시간 안에 읽는다. 한쪽의 실패가 다른 쪽을 막지 않는다.
    const deadline = new Promise<null>((resolve) => {
      timer = setTimeout(() => { expired = true; resolve(null); }, 1500);
    });
    const plans = (async () => {
      const allowed = await isCostPlanningAllowed(user.id);
      if (expired) return null;
      plansEnabled = allowed;
      return allowed ? listSoonPlans({ id: user.id, role: user.role }) : null;
    })().catch((err) => {
      unstable_rethrow(err);
      const error = summarizeError(err);
      console.error(`[Plans] soon plans read failed: ${error.name}: ${error.message}`);
      return null;
    });
    const firstGuide = hasExpenseHistory(user.id).then((hasHistory) => !hasHistory).catch(() => false);
    const [planResult, guideResult] = await Promise.all([
      Promise.race([plans, deadline]),
      Promise.race([firstGuide, deadline]),
    ]);
    soonPlans = planResult;
    showGuide = guideResult === true;
  } finally {
    expired = true;
    clearTimeout(timer);
  }
  return <NewExpenseChooser
    plansEnabled={plansEnabled}
    soonPlans={soonPlans}
    firstGuide={showGuide ? <ExpenseGuideStart key={user.id} userId={user.id} /> : null}
  />;
}
