// ---------------------------------------------------------------------------
// 승인 경로에서 부르는 자동 「지급 완료」 맞추기 — 실패해도 승인은 그대로 둔다.
//
// 계획 DB 풀(plans-client)은 필요할 때만 불러온다(결합 검토 P6, 비용 생성 라우트의 계획 연결과 같은 방식).
// 비용계획 스위치가 꺼져 있으면 아무것도 하지 않는다. 규칙은 plan.service syncPlanPaidForExpense 한 곳.
// ---------------------------------------------------------------------------

export async function syncPlanPaidSafely(
  expenseId: string,
  actorId: string,
  event: "approved" | "unapproved",
): Promise<void> {
  try {
    const { isCostPlanningAllowed } = await import("@/lib/plans/flag");
    if (!(await isCostPlanningAllowed(actorId))) return;
    const { syncPlanPaidForExpense } = await import("@/services/plan.service");
    await syncPlanPaidForExpense(expenseId, actorId, event);
  } catch (err) {
    console.error("[Plans] auto paid sync failed:", err instanceof Error ? err.name : "unknown");
  }
}
