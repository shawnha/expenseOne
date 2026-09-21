import type { Metadata } from "next";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { PlanError, toSafeError } from "@/lib/plans/errors";
import { isCostPlanningAllowed } from "@/lib/plans/flag";
import { getPlanDetail, type PlanDetail } from "@/services/plan.service";
import { PlanDetailView } from "@/components/plans/plan-detail";

// ---------------------------------------------------------------------------
// /plans/[id] — 계획 상세.
//
// 참여자가 아니면 **404**다. "권한이 없습니다"로 답하면 그 계획이 있다는 사실을 알려 주는 셈이라
// 서비스도 화면도 없는 것과 똑같이 취급한다(SCHEMA.md 4절 (c)).
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "비용계획" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PlanDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PlanDetailPage({ params }: PlanDetailPageProps) {
  const user = await getCachedCurrentUser();
  if (!user) redirect("/login");
  if (!(await isCostPlanningAllowed(user.id))) notFound();

  const { id } = await params;
  // uuid 가 아니면 조회에 보내지 않는다 — 보냈다면 22P02 로 500 이 났을 자리다.
  if (!UUID_RE.test(id)) notFound();

  let detail: PlanDetail;
  try {
    detail = await getPlanDetail({ id: user.id, role: user.role }, id);
  } catch (err) {
    // Next 내부 신호(redirect·notFound 등)는 삼키지 않는다.
    unstable_rethrow(err);
    if (err instanceof PlanError && err.code === "NOT_FOUND") notFound();
    // Next 가 오류를 통째로 로그에 찍는다 — 드리즐 오류 문장의 SQL·params 를 빼고 던진다(QA D-01).
    throw toSafeError(err);
  }

  return <PlanDetailView detail={detail} />;
}
