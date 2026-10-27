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
  let plansEnabled = false;
  let soonPlans: SoonPlans | null = null;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // flag와 목록을 합쳐 1.5초까지만 기다린다. 늦은 flag로 새 DB 조회를 시작하지 않는다.
    const result = await Promise.race([
      (async () => {
        const allowed = await isCostPlanningAllowed(user.id);
        if (!allowed || expired) return null;
        const plans = await listSoonPlans({ id: user.id, role: user.role });
        return { plansEnabled: true, soonPlans: plans };
      })(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => { expired = true; resolve(null); }, 1500);
      }),
    ]);
    if (result) ({ plansEnabled, soonPlans } = result);
  } catch (err) {
    unstable_rethrow(err);
    // flag·목록 실패가 기존 제출 메뉴를 막지 않게 SQL·params 없는 요약만 남긴다.
    const error = summarizeError(err);
    console.error(`[Plans] soon plans read failed: ${error.name}: ${error.message}`);
  } finally {
    expired = true;
    clearTimeout(timer);
  }
  return <NewExpenseChooser plansEnabled={plansEnabled} soonPlans={soonPlans} />;
}
