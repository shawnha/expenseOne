import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCachedCurrentUser } from "@/lib/supabase/cached";
import { currentMonthKST } from "@/lib/plans/diff";
import { isCostPlanningAllowed } from "@/lib/plans/flag";
import { boardQuerySchema } from "@/lib/validations/plan";
import { getBoard } from "@/services/plan.service";
import { MonthBoard } from "@/components/plans/month-board";
import { PlanToolbar } from "@/components/plans/plan-toolbar";
import { PlanCreateButton } from "@/components/plans/plan-dialog";
import { ProjectOpenButton } from "@/components/plans/project-dialog";

// ---------------------------------------------------------------------------
// /plans — 월별 비용계획 보드.
//
// 서버 컴포넌트가 서비스를 **직접** 부른다(자기 API 를 fetch 하지 않는다 — 쿠키를 되돌려
// 붙이는 왕복이 늘고 오류 한 겹이 더 생긴다).
//
// 스위치가 꺼져 있으면 404. 403 이 아닌 이유는 API 와 같다 — 기능이 있다는 것 자체를 알리지 않는다.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "비용계획" };

/** 보드가 읽는 쿼리 값만 추린다. 배열로 들어온 중복 파라미터는 버린다. */
const QUERY_KEYS = ["from", "companyId", "projectId", "brandId", "status"] as const;

interface PlansPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PlansPage({ searchParams }: PlansPageProps) {
  const user = await getCachedCurrentUser();
  if (!user) redirect("/login");
  if (!(await isCostPlanningAllowed(user.id))) notFound();

  const params = await searchParams;
  const raw: Record<string, string> = {};
  for (const key of QUERY_KEYS) {
    const value = params[key];
    if (typeof value === "string" && value !== "") raw[key] = value;
  }

  // 손으로 고친 주소 하나가 화면 전체를 오류로 만들지 않게, 검증에 실패하면 기본값으로 연다.
  const parsed = boardQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : boardQuerySchema.parse({});

  const board = await getBoard({ id: user.id, role: user.role }, query);
  const currentMonth = currentMonthKST();

  return (
    <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">비용계획</h1>
          <p className="mt-0.5 text-footnote text-[var(--apple-secondary-label)]">
            앞으로 나갈 돈을 달별로 세워 두고, 실제 입금요청과 맞춰 봅니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProjectOpenButton />
          <PlanCreateButton defaultCompanyId={query.companyId} />
        </div>
      </header>

      <PlanToolbar board={board} currentMonth={currentMonth} />

      <MonthBoard
        board={board}
        showCompany={!query.companyId}
        companyId={query.companyId}
        currentMonth={currentMonth}
      />
    </div>
  );
}
