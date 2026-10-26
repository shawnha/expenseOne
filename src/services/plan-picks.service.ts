/**
 * 비용(입금요청·법카) 쪽에서 비용계획을 고르는 조회 — 「내 비용계획에서 불러올까요?」, 계획 카드의
 * 「입금요청으로 만들기」, 법카 등록 때 「이 결제, 계획에 연결할까요?」.
 *
 * 전부 읽기 전용이다. 보이는 범위는 계획 화면과 같다(참여한 사업의 계획, 대표는 전부 — projectScopeSql).
 * 연결 자체는 기존 linkExpenses 가 한다(권한·법인·중복 검사가 거기 한 곳에 있다).
 */
import { sql } from "drizzle-orm";
import { withPlanTx } from "@/lib/db/plans-client";
import { loadAccess, projectScopeSql, requirePlanAccess } from "@/lib/plans/permissions";
import { num, rowsOf } from "@/lib/plans/rows";
import { rankSuggestions, SUGGEST_DATE_WINDOW_DAYS } from "@/lib/plans/suggest";
import type { PlanActorInput } from "@/services/plan.service";

/** 입금요청 불러오기 목록의 날짜 창 (오늘 기준) */
const PICK_PAST_DAYS = 45;
const PICK_FUTURE_DAYS = 60;
const PICK_MINE_LIMIT = 10;
const PICK_OTHERS_LIMIT = 20;
const CARD_SUGGEST_LIMIT = 5;

export interface PlanPick {
  id: string;
  title: string;
  /** 계획 금액 — 입금요청 폼은 원화 계획이면 금액 칸을 이 값으로 채우고 띠로 확인을 받는다(2026-10-26 오너 결정, lib/deposit-prefill) */
  amount: number;
  /** 계획 통화. 지금 운영 계획은 전부 KRW */
  currency: string;
  plannedDate: string;
  datePrecision: string;
  companyId: string;
  companyName: string | null;
  projectName: string;
  vendorName: string | null;
  /** 담당자(처음 추가한 사람) 이름 */
  ownerName: string | null;
  /** 내가 담당자인 계획 */
  mine: boolean;
}

interface PickRow {
  id: string;
  title: string;
  amount: number | string;
  currency: string | null;
  planned_date: string;
  date_precision: string;
  company_id: string;
  company_name: string | null;
  project_name: string;
  vendor_name: string | null;
  owner_name: string | null;
  mine: boolean;
}

function toPick(r: PickRow): PlanPick {
  return {
    id: r.id,
    title: r.title,
    amount: num(r.amount),
    currency: r.currency ?? "KRW",
    plannedDate: r.planned_date,
    datePrecision: r.date_precision,
    companyId: r.company_id,
    companyName: r.company_name,
    projectName: r.project_name,
    vendorName: r.vendor_name,
    ownerName: r.owner_name,
    mine: r.mine,
  };
}

const access = (actor: PlanActorInput) => ({ userId: actor.id, role: actor.role });

/**
 * 입금요청 폼의 「내 비용계획에서 불러올까요?」 — 아직 아무 비용도 이어지지 않은, 날짜가 가까운 계획.
 * mine = 내가 담당자인 것(기본으로 보임), others = 같은 사업의 다른 사람 것(접어 둠).
 * 지급 완료 표시가 된 계획은 뺀다.
 */
export async function listDepositPlanPicks(actor: PlanActorInput): Promise<{ mine: PlanPick[]; others: PlanPick[] }> {
  return withPlanTx(async (tx) => {
    const acc = await loadAccess(tx, access(actor));
    const rows = rowsOf<PickRow>(
      await tx.execute(sql`WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Seoul')::date AS d)
        SELECT p.id, p.title, p.amount, p.planned_date::text AS planned_date, p.date_precision,
               p.company_id, c.name AS company_name, j.name AS project_name, p.vendor_name, p.currency,
               u.name AS owner_name, (p.created_by_id = ${acc.userId}::uuid) AS mine
          FROM expenseone.cost_plans p
          JOIN expenseone.plan_projects j ON j.id = p.project_id AND j.deleted_at IS NULL
          LEFT JOIN expenseone.companies c ON c.id = p.company_id
          LEFT JOIN expenseone.users u ON u.id = p.created_by_id
          CROSS JOIN today
         WHERE p.deleted_at IS NULL AND p.status = 'PLANNED' AND p.paid_at IS NULL
           AND ${projectScopeSql(acc, sql`p.project_id`)}
           AND p.planned_date BETWEEN today.d - ${PICK_PAST_DAYS}::int AND today.d + ${PICK_FUTURE_DAYS}::int
           AND NOT EXISTS (SELECT 1 FROM expenseone.plan_expense_links x
                            WHERE x.plan_id = p.id AND x.unlinked_at IS NULL)
         ORDER BY (p.created_by_id = ${acc.userId}::uuid) DESC, abs(p.planned_date - today.d), p.planned_date, p.id
         LIMIT ${PICK_MINE_LIMIT + PICK_OTHERS_LIMIT + 20}::int`),
    );
    const picks = rows.map(toPick);
    return {
      mine: picks.filter((p) => p.mine).slice(0, PICK_MINE_LIMIT),
      others: picks.filter((p) => !p.mine).slice(0, PICK_OTHERS_LIMIT),
    };
  }, { readOnly: true });
}

/**
 * 계획 하나를 폼에 불러올 값. 볼 수 없거나(남의 사업) 진행 중이 아니면 null — 폼은 그냥 빈 채로 열린다.
 */
export async function getPlanPick(actor: PlanActorInput, planId: string): Promise<PlanPick | null> {
  return withPlanTx(async (tx) => {
    const acc = await loadAccess(tx, access(actor));
    try {
      const plan = await requirePlanAccess(tx, acc, planId);
      if (plan.status !== "PLANNED") return null;
    } catch {
      return null;
    }
    const rows = rowsOf<PickRow>(
      await tx.execute(sql`SELECT p.id, p.title, p.amount, p.planned_date::text AS planned_date, p.date_precision,
               p.company_id, c.name AS company_name, j.name AS project_name, p.vendor_name, p.currency,
               u.name AS owner_name, (p.created_by_id = ${acc.userId}::uuid) AS mine
          FROM expenseone.cost_plans p
          JOIN expenseone.plan_projects j ON j.id = p.project_id
          LEFT JOIN expenseone.companies c ON c.id = p.company_id
          LEFT JOIN expenseone.users u ON u.id = p.created_by_id
         WHERE p.id = ${planId}::uuid`),
    );
    return rows[0] ? toPick(rows[0]) : null;
  }, { readOnly: true });
}

/**
 * 법카 등록(고위드 알림) 때 「이 결제, 계획에 연결할까요?」 — 같은 법인, 결제일 ±45일 계획 최대 5건.
 * 날짜만 맞는 계획은 제안하지 않는다(법카는 소액이 많아 날짜만으로는 엉뚱한 계획이 뜬다 — PR #5 가 법카를
 * 제안에서 뺀 이유). 금액이나 이름이 맞는 계획을 먼저, 나머지는 내가 담당인 계획을 날짜 가까운 순으로.
 * 법카는 한 계획에 여러 장이 이어질 수 있어 이미 연결이 있는 계획도 후보다.
 */
export async function suggestPlansForCard(
  actor: PlanActorInput,
  input: { companyId: string; amount: number; date: string; merchant: string | null },
): Promise<PlanPick[]> {
  return withPlanTx(async (tx) => {
    const acc = await loadAccess(tx, access(actor));
    const rows = rowsOf<PickRow>(
      await tx.execute(sql`SELECT p.id, p.title, p.amount, p.planned_date::text AS planned_date, p.date_precision,
               p.company_id, c.name AS company_name, j.name AS project_name, p.vendor_name, p.currency,
               u.name AS owner_name, (p.created_by_id = ${acc.userId}::uuid) AS mine
          FROM expenseone.cost_plans p
          JOIN expenseone.plan_projects j ON j.id = p.project_id AND j.deleted_at IS NULL
          LEFT JOIN expenseone.companies c ON c.id = p.company_id
          LEFT JOIN expenseone.users u ON u.id = p.created_by_id
         WHERE p.deleted_at IS NULL AND p.status = 'PLANNED' AND p.paid_at IS NULL
           AND p.company_id = ${input.companyId}::uuid
           AND ${projectScopeSql(acc, sql`p.project_id`)}
           AND abs(p.planned_date - ${input.date}::date) <= ${SUGGEST_DATE_WINDOW_DAYS}::int
         ORDER BY abs(p.planned_date - ${input.date}::date), p.id
         LIMIT 200`),
    );
    const picks = rows.map(toPick);
    // 점수 함수는 계획→비용 제안과 같은 것을 거꾸로 쓴다(기준 = 이 결제, 후보 = 계획)
    const ranked = rankSuggestions(
      { amount: input.amount, plannedDate: input.date, title: input.merchant ?? "" },
      picks.map((p) => ({ id: p.id, amount: p.amount, date: p.plannedDate, title: p.title, pick: p })),
      picks.length,
    );
    const strong = ranked
      .filter((r) => r.reasons.includes("amount") || r.reasons.includes("title"))
      .map((r) => r.candidate.pick);
    const strongIds = new Set(strong.map((p) => p.id));
    // picks 는 이미 결제일과 가까운 순이다
    const mine = picks.filter((p) => p.mine && !strongIds.has(p.id));
    return [...strong, ...mine].slice(0, CARD_SUGGEST_LIMIT);
  }, { readOnly: true });
}
