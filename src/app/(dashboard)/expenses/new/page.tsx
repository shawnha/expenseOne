import { redirect, unstable_rethrow } from "next/navigation";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { isCostPlanningAllowed } from "@/lib/plans/flag";
import { summarizeError } from "@/lib/plans/errors";
import { listSoonPlans, type SoonPlans } from "@/services/plan-picks.service";
import { NewExpenseChooser } from "./new-expense-chooser";

export const dynamic = "force-dynamic";

/** 첫 그림 전에 계획을 읽는다 — 늦게 도착한 목록이 법카 카드를 밀지 않게 한다. */
export default async function NewExpensePage() {
  const user = await getCachedCurrentUser();
  if (!user) redirect("/login");
  const plansEnabled = await isCostPlanningAllowed(user.id);
  let soonPlans: SoonPlans | null = null;
  if (plansEnabled) {
    try {
      soonPlans = await listSoonPlans({ id: user.id, role: user.role });
    } catch (err) {
      unstable_rethrow(err);
      // 목록 실패가 기존 비용 제출 메뉴를 막지 않게, SQL·params 없는 요약만 남긴다.
      const error = summarizeError(err);
      console.error(`[Plans] soon plans read failed: ${error.name}: ${error.message}`);
    }
  }
  return <NewExpenseChooser plansEnabled={plansEnabled} soonPlans={soonPlans} />;
}
