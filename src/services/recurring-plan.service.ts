import { sql } from "drizzle-orm";
import { withPlanTx, type PlanTx } from "@/lib/db/plans-client";
import { loadAccess, requireProjectAccess } from "@/lib/plans/permissions";
import { isCostPlanningAllowed } from "@/lib/plans/flag";
import { PlanError } from "@/lib/plans/errors";
import { num, rowsOf } from "@/lib/plans/rows";
import { toDatePrecision } from "@/lib/plans/diff";
import { logChange } from "@/services/plan.service";
import {
  occurrenceDatesBetween,
  planDateFor,
  planOccurrenceSync,
  planWindow,
  type DesiredPlanFields,
  type ExistingOccurrence,
} from "@/lib/recurring-occurrences";
import type { Schedule } from "@/lib/recurring-schedule";

// ---------------------------------------------------------------------------
// 반복 지급 → 비용계획 (0029)
//
// 반복 하나가 비용계획에 회차마다 계획 한 장(cost_plans)을 미리 깐다. 무엇을 깔고 고치고 지울지는
// lib/recurring-occurrences 의 planOccurrenceSync 가 정하고, 여기서는 그대로 쓰기만 한다.
//
// 규칙
//   - 반복 한 건 단위로 한 트랜잭션. 첫 문장에서 반복 행을 FOR UPDATE 로 잠가 cron 과 사용자 수정이
//     같은 반복을 동시에 맞추지 않게 한다(회차 UNIQUE 가 최후 방어선).
//   - 계획의 담당자(created_by_id)는 반복 등록자. 등록자가 그 프로젝트 참여자(또는 대표)가 아니면 깔지 않는다.
//   - 이력(plan_change_log)은 남기고 푸시는 보내지 않는다 — 매달 자동으로 생기는 카드마다 참여자 전원에게
//     푸시가 가면 소음이다. 다른 참여자에게는 보드의 '새로 추가' 표시가 한 번 뜬다.
//   - 고치거나 지울 때는 `version = 우리가 마지막으로 쓴 값` 조건으로만 쓴다. 그 사이 사람이 고쳤으면 0행 → 건너뛴다.
//   - expenses 는 읽기만 한다. 연결 스냅샷(plan_expense_links)은 plan.service.linkExpense 와 같은 INSERT … SELECT.
// ---------------------------------------------------------------------------

/** KST 기준 오늘(yyyy-mm-dd). */
export function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

interface TemplateRow {
  id: string;
  title: string;
  amount: number;
  currency: string;
  company_id: string;
  submitted_by_id: string;
  account_holder: string | null;
  frequency: string;
  interval_count: number;
  day_of_month: number | null;
  month_of_year: number | null;
  weekday: number | null;
  is_active: boolean;
  plan_project_id: string | null;
  plan_brand_id: string | null;
  plan_date_precision: string;
  starts_on: string | null;
  ends_on: string | null;
  next_run_date: string;
}

async function lockTemplate(tx: PlanTx, recurringId: string): Promise<TemplateRow | null> {
  return (
    rowsOf<TemplateRow>(
      await tx.execute(sql`SELECT r.id, r.title, r.amount, r.currency, r.company_id, r.submitted_by_id,
                                  r.account_holder, r.frequency, r.interval_count, r.day_of_month,
                                  r.month_of_year, r.weekday, r.is_active, r.plan_project_id, r.plan_brand_id,
                                  r.plan_date_precision, r.starts_on::text AS starts_on, r.ends_on::text AS ends_on,
                                  r.next_run_date::text AS next_run_date
                             FROM expenseone.recurring_expenses r
                            WHERE r.id = ${recurringId}::uuid
                              FOR UPDATE OF r`),
    )[0] ?? null
  );
}

function scheduleOf(t: TemplateRow): Schedule {
  return {
    frequency: t.frequency as Schedule["frequency"],
    intervalCount: num(t.interval_count),
    dayOfMonth: t.day_of_month,
    monthOfYear: t.month_of_year,
    weekday: t.weekday,
  };
}

/** 지금 반복에 붙은 회차(창 시작 이후). 계획이 있으면 계획 상태까지. */
async function loadExistingOccurrences(tx: PlanTx, recurringId: string, from: string): Promise<ExistingOccurrence[]> {
  const rows = rowsOf<{
    id: string;
    occurrence_date: string;
    run_at: Date | null;
    plan_id: string | null;
    plan_version: number | null;
    version: number | null;
    status: string | null;
    deleted_at: Date | null;
    paid_at: Date | null;
    erp_applied_at: Date | null;
    active_links: number;
    company_id: string | null;
    project_id: string | null;
    brand_id: string | null;
    title: string | null;
    amount: number | null;
    vendor_name: string | null;
    planned_date: string | null;
    date_precision: string | null;
  }>(
    await tx.execute(sql`SELECT o.id, o.occurrence_date::text AS occurrence_date, o.run_at, o.plan_id, o.plan_version,
                                p.version, p.status, p.deleted_at, p.paid_at, p.erp_applied_at,
                                (SELECT count(*)::int FROM expenseone.plan_expense_links x
                                  WHERE x.plan_id = p.id AND x.unlinked_at IS NULL) AS active_links,
                                p.company_id, p.project_id, p.brand_id, p.title, p.amount, p.vendor_name,
                                p.planned_date::text AS planned_date, p.date_precision
                           FROM expenseone.recurring_occurrences o
                           LEFT JOIN expenseone.cost_plans p ON p.id = o.plan_id
                          WHERE o.recurring_expense_id = ${recurringId}::uuid
                            AND o.occurrence_date >= ${from}::date
                          ORDER BY o.occurrence_date`),
  );
  const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);
  return rows.map((r) => ({
    occurrenceId: r.id,
    occurrenceDate: r.occurrence_date,
    runAt: iso(r.run_at),
    planId: r.plan_id,
    planVersion: r.plan_version == null ? null : num(r.plan_version),
    version: r.version == null ? null : num(r.version),
    status: r.status,
    deletedAt: iso(r.deleted_at),
    paidAt: iso(r.paid_at),
    erpAppliedAt: iso(r.erp_applied_at),
    activeLinks: num(r.active_links),
    plan:
      r.plan_id && r.company_id && r.project_id && r.title != null && r.amount != null && r.planned_date
        ? {
            companyId: r.company_id,
            projectId: r.project_id,
            brandId: r.brand_id,
            title: r.title,
            amount: num(r.amount),
            vendorName: r.vendor_name,
            plannedDate: r.planned_date,
            datePrecision: toDatePrecision(r.date_precision),
          }
        : null,
  }));
}

export interface SyncResult {
  created: number;
  updated: number;
  removed: number;
  /** 깔지 못한 이유(권한·스위치). 오류가 아니라 건너뜀. */
  skipped?: string;
}

/**
 * 반복 하나의 비용계획을 맞춘다. 반복을 만들거나 고친 직후, 그리고 매일 cron 이 부른다.
 * actorId = 이력에 남길 사람(cron 이면 등록자, 화면이면 고친 사람). floor = 창 시작(기본 이번 달 1일).
 */
export async function syncRecurringPlans(
  recurringId: string,
  opts: { actorId: string; today?: string; floor?: string },
): Promise<SyncResult> {
  const today = opts.today ?? todayKST();
  const result: SyncResult = { created: 0, updated: 0, removed: 0 };

  // 스위치는 트랜잭션 밖에서(자체 캐시·자체 트랜잭션). 등록자 기준 — 계획의 담당자가 그 사람이다.
  // 꺼져 있으면 새로 깔지만 않는다. 이미 깐 것을 지우지도 않는다(스위치는 화면을 가리는 것뿐).
  const peek = await withPlanTx(
    async (tx) =>
      rowsOf<{ submitted_by_id: string }>(
        await tx.execute(sql`SELECT submitted_by_id FROM expenseone.recurring_expenses WHERE id = ${recurringId}::uuid`),
      )[0] ?? null,
    { readOnly: true },
  );
  if (!peek) return { ...result, skipped: "반복 설정 없음" };
  const flagOn = await isCostPlanningAllowed(peek.submitted_by_id);

  return withPlanTx(async (tx) => {
    const t = await lockTemplate(tx, recurringId);
    if (!t) return { ...result, skipped: "반복 설정 없음" };

    let desired: DesiredPlanFields | null = null;
    let skipped: string | undefined;
    if (t.is_active && t.plan_project_id && t.currency === "KRW") {
      if (!flagOn) {
        skipped = "비용계획 스위치 꺼짐";
      } else {
        // 계획 화면(createPlan)과 같은 규칙: 활성 원화 법인, 활성 분류만. 꺼졌으면 새로 깔지 않는다(이미 깐 건 그대로).
        const usable = rowsOf<{ company_ok: boolean; brand_ok: boolean }>(
          await tx.execute(sql`SELECT EXISTS (SELECT 1 FROM expenseone.companies c
                                               WHERE c.id = ${t.company_id}::uuid AND c.is_active = true
                                                 AND coalesce(c.currency, 'KRW') = 'KRW') AS company_ok,
                                      (${t.plan_brand_id}::uuid IS NULL OR EXISTS (
                                         SELECT 1 FROM expenseone.plan_brands b
                                          WHERE b.id = ${t.plan_brand_id}::uuid AND b.is_active = true)) AS brand_ok`),
        )[0];
        if (!usable?.company_ok) return { ...result, skipped: "비용계획을 쓸 수 없는 회사" };
        if (!usable?.brand_ok) return { ...result, skipped: "분류가 꺼져 있음" };
        // 등록자가 그 프로젝트를 볼 수 있어야 깐다(참여자에서 빠졌거나 프로젝트가 삭제됐으면 404).
        const ownerAccess = await loadAccess(tx, { userId: t.submitted_by_id, role: "MEMBER" });
        try {
          await requireProjectAccess(tx, ownerAccess, t.plan_project_id);
          desired = {
            companyId: t.company_id,
            projectId: t.plan_project_id,
            brandId: t.plan_brand_id,
            title: t.title,
            amount: num(t.amount),
            datePrecision: toDatePrecision(t.plan_date_precision),
            vendorName: t.account_holder,
          };
        } catch (err) {
          if (!(err instanceof PlanError && err.code === "NOT_FOUND")) throw err;
          skipped = "등록자가 프로젝트 참여자가 아님";
        }
      }
    }
    // 권한·스위치로 못 까는 경우엔 이미 깐 것도 그대로 둔다(지우는 건 사용자가 끄거나 멈췄을 때만).
    if (skipped) return { ...result, skipped };

    const window = planWindow({ startsOn: t.starts_on, endsOn: t.ends_on }, today, opts.floor);
    // 기준 회차 = 시작일(옛 행은 다음 처리일). cron 의 처리 날짜와 같은 사슬이어야 계획과 입금요청이 같은 날에 붙는다.
    const anchor = t.starts_on ?? t.next_run_date;
    const dates = desired && window ? occurrenceDatesBetween(scheduleOf(t), anchor, window.from, window.to) : [];
    // 창 시작부터 읽는다 — 이번 달 앞쪽에 이미 처리된 회차가 "없는 날"로 보이면 다시 깔린다.
    const existing = await loadExistingOccurrences(tx, t.id, window && window.from < today ? window.from : today);
    const plan = planOccurrenceSync({ desired, dates, existing, today });

    for (const r of plan.remove) {
      const done = rowsOf<{ company_id: string; project_id: string; title: string }>(
        await tx.execute(sql`UPDATE expenseone.cost_plans p
                                SET deleted_at = now(), deleted_by_id = ${opts.actorId}::uuid,
                                    version = p.version + 1, updated_by_id = ${opts.actorId}::uuid, updated_at = now()
                              WHERE p.id = ${r.planId}::uuid AND p.deleted_at IS NULL
                                AND p.version = (SELECT o.plan_version FROM expenseone.recurring_occurrences o
                                                  WHERE o.id = ${r.occurrenceId}::uuid)
                          RETURNING p.company_id, p.project_id, p.title`),
      )[0];
      if (!done) continue; // 그 사이 사람이 고쳤다 — 이제 사람 것이다.
      await logChange(tx, {
        companyId: done.company_id,
        projectId: done.project_id,
        planId: r.planId,
        entityType: "plan",
        entityId: r.planId,
        action: "DELETE",
        actorId: opts.actorId,
        before: { title: done.title },
        reason: "반복 지급 변경으로 자동 정리",
      });
      await tx.execute(sql`DELETE FROM expenseone.recurring_occurrences WHERE id = ${r.occurrenceId}::uuid`);
      result.removed++;
    }

    for (const u of plan.update) {
      const c = u.changes;
      const sets = [
        c.projectId !== undefined ? sql`project_id = ${c.projectId}::uuid` : null,
        c.brandId !== undefined ? sql`brand_id = ${c.brandId}::uuid` : null,
        c.title !== undefined ? sql`title = ${c.title}` : null,
        c.amount !== undefined ? sql`amount = ${c.amount}` : null,
        c.vendorName !== undefined ? sql`vendor_name = ${c.vendorName}` : null,
        c.plannedDate !== undefined ? sql`planned_date = ${c.plannedDate}::date` : null,
        c.datePrecision !== undefined ? sql`date_precision = ${c.datePrecision}` : null,
        sql`version = version + 1`,
        sql`updated_by_id = ${opts.actorId}::uuid`,
        sql`updated_at = now()`,
      ].filter((s): s is ReturnType<typeof sql> => s != null);
      const row = rowsOf<{ version: number; company_id: string; project_id: string }>(
        await tx.execute(sql`UPDATE expenseone.cost_plans SET ${sql.join(sets, sql`, `)}
                              WHERE id = ${u.planId}::uuid AND version = ${u.expectedVersion} AND deleted_at IS NULL
                          RETURNING version, company_id, project_id`),
      )[0];
      if (!row) continue;
      await tx.execute(sql`UPDATE expenseone.recurring_occurrences
                              SET plan_version = ${num(row.version)}, updated_at = now()
                            WHERE id = ${u.occurrenceId}::uuid`);
      await logChange(tx, {
        companyId: row.company_id,
        projectId: row.project_id,
        planId: u.planId,
        entityType: "plan",
        entityId: u.planId,
        action: "UPDATE",
        actorId: opts.actorId,
        after: { ...c, version: num(row.version) },
        reason: "반복 지급 변경을 따라 고침",
      });
      result.updated++;
    }

    for (const date of plan.create) {
      if (!desired) break;
      const plannedDate = planDateFor(date, desired.datePrecision);
      const created = rowsOf<{ id: string }>(
        await tx.execute(sql`INSERT INTO expenseone.cost_plans
              (company_id, project_id, brand_id, title, amount, currency, planned_date, date_precision,
               vendor_name, created_by_id, updated_by_id)
            VALUES (${desired.companyId}::uuid, ${desired.projectId}::uuid, ${desired.brandId}::uuid, ${desired.title},
                    ${desired.amount}, 'KRW', ${plannedDate}::date, ${desired.datePrecision},
                    ${desired.vendorName}, ${t.submitted_by_id}::uuid, ${opts.actorId}::uuid)
            RETURNING id`),
      )[0];
      // 회차 줄: 없으면 만들고, 계획 없이 있던 줄(아직 처리 전)이면 계획을 붙인다.
      const occ = rowsOf<{ id: string }>(
        await tx.execute(sql`INSERT INTO expenseone.recurring_occurrences
              (recurring_expense_id, occurrence_date, plan_id, plan_version)
            VALUES (${t.id}::uuid, ${date}::date, ${created.id}::uuid, 1)
            ON CONFLICT (recurring_expense_id, occurrence_date) DO UPDATE
               SET plan_id = EXCLUDED.plan_id, plan_version = 1, updated_at = now()
             WHERE recurring_occurrences.plan_id IS NULL AND recurring_occurrences.run_at IS NULL
            RETURNING id`),
      )[0];
      if (!occ) {
        // 계획 판단 이후 다른 경로가 회차를 처리했다(잠금 때문에 일어나지 않아야 한다). 깐 계획을 되돌린다.
        throw new PlanError("CONFLICT", "반복 회차가 동시에 바뀌었습니다. 잠시 후 다시 시도해주세요.");
      }
      await logChange(tx, {
        companyId: desired.companyId,
        projectId: desired.projectId,
        planId: created.id,
        entityType: "plan",
        entityId: created.id,
        action: "CREATE",
        actorId: opts.actorId,
        after: {
          title: desired.title,
          amount: desired.amount,
          plannedDate,
          datePrecision: desired.datePrecision,
          projectId: desired.projectId,
          brandId: desired.brandId,
          vendorName: desired.vendorName,
          recurringExpenseId: t.id,
        },
        reason: "반복 지급에서 자동 생성",
      });
      result.created++;
    }
    return result;
  });
}

/** 매일 cron: 비용계획을 켠 활성 반복 전부의 창을 민다. 한 건이 실패해도 나머지는 계속. */
export async function materializeRecurringPlans(today: string = todayKST()) {
  const targets = await withPlanTx(
    async (tx) =>
      rowsOf<{ id: string; submitted_by_id: string; title: string }>(
        // 켜진 반복 + 멈췄거나 비용계획을 껐는데 안 건드린 미래 계획이 남은 반복(화면에서 정리하다 실패한 경우 여기서 마저 걷는다).
        await tx.execute(sql`SELECT r.id, r.submitted_by_id, r.title FROM expenseone.recurring_expenses r
                              WHERE (r.is_active AND r.plan_project_id IS NOT NULL)
                                 OR EXISTS (SELECT 1 FROM expenseone.recurring_occurrences o
                                             WHERE o.recurring_expense_id = r.id AND o.plan_id IS NOT NULL
                                               AND o.run_at IS NULL AND o.occurrence_date >= ${today}::date)
                              ORDER BY r.created_at`),
      ),
    { readOnly: true },
  );
  const results: Array<{ recurringId: string; title: string } & (SyncResult | { error: string })> = [];
  for (const t of targets) {
    try {
      const r = await syncRecurringPlans(t.id, { actorId: t.submitted_by_id, today });
      results.push({ recurringId: t.id, title: t.title, ...r });
    } catch (err) {
      console.error(`[RecurringPlans] ${t.title} 맞추기 실패:`, err);
      results.push({ recurringId: t.id, title: t.title, error: err instanceof Error ? err.message : "알 수 없는 오류" });
    }
  }
  return { checked: targets.length, results };
}

// ---------------------------------------------------------------------------
// 회차 ↔ 입금요청
// ---------------------------------------------------------------------------

export interface OccurrenceRef {
  occurrenceId: string;
  recurringId: string;
  occurrenceDate: string;
  submittedById: string;
  expenseId: string | null;
}

/** 회차 하나(없으면 null). 폼 미리 채우기·제출 전 검사용. */
export async function getOccurrence(occurrenceId: string): Promise<OccurrenceRef | null> {
  return withPlanTx(
    async (tx) => {
      const r = rowsOf<{
        id: string;
        recurring_expense_id: string;
        occurrence_date: string;
        submitted_by_id: string;
        expense_id: string | null;
      }>(
        await tx.execute(sql`SELECT o.id, o.recurring_expense_id, o.occurrence_date::text AS occurrence_date,
                                    r.submitted_by_id,
                                    -- 지워진 입금요청을 가리키면 없는 것으로 본다(expense_id 는 FK 가 없다).
                                    (SELECT e.id FROM expenseone.expenses e WHERE e.id = o.expense_id) AS expense_id
                               FROM expenseone.recurring_occurrences o
                               JOIN expenseone.recurring_expenses r ON r.id = o.recurring_expense_id
                              WHERE o.id = ${occurrenceId}::uuid`),
      )[0];
      if (!r) return null;
      return {
        occurrenceId: r.id,
        recurringId: r.recurring_expense_id,
        occurrenceDate: r.occurrence_date,
        submittedById: r.submitted_by_id,
        expenseId: r.expense_id,
      };
    },
    { readOnly: true },
  );
}

/**
 * 회차가 처리됐다고 적는다(자동 제출·알림). 이미 처리된 회차면 false — cron 이 같은 날 두 번 돌거나 밀린
 * 회차를 따라잡을 때 같은 회차를 두 번 처리하지 않는 근거다. 회차 줄이 없으면 만든다.
 */
export async function claimOccurrence(recurringId: string, date: string): Promise<{ occurrenceId: string } | null> {
  return withPlanTx(async (tx) => {
    await tx.execute(sql`INSERT INTO expenseone.recurring_occurrences (recurring_expense_id, occurrence_date)
                         VALUES (${recurringId}::uuid, ${date}::date)
                         ON CONFLICT (recurring_expense_id, occurrence_date) DO NOTHING`);
    const row = rowsOf<{ id: string }>(
      await tx.execute(sql`UPDATE expenseone.recurring_occurrences SET run_at = now(), updated_at = now()
                            WHERE recurring_expense_id = ${recurringId}::uuid AND occurrence_date = ${date}::date
                              AND run_at IS NULL
                        RETURNING id`),
    )[0];
    return row ? { occurrenceId: row.id } : null;
  });
}

/**
 * 사람이 알림 폼으로 이 회차 입금요청을 올리기 직전에 선점한다. 아직 입금요청이 없고, 다른 탭이 2분 안에 선점하지
 * 않았을 때만 성공. 두 탭(푸시 링크·알림 목록)에서 동시에 올려 같은 달이 두 번 올라가는 것을 막는다 — 입금요청은
 * 다른 DB 연결(db)로 만들어 한 트랜잭션으로 못 묶으므로 조건부 UPDATE 로 먼저 자리를 잡는다.
 * 지워진 입금요청을 가리키는 회차(expense_id 는 FK 가 없다)는 빈 것으로 본다.
 */
export async function reserveOccurrence(occurrenceId: string, ownerId: string): Promise<"ok" | "not_found" | "taken"> {
  return withPlanTx(async (tx) => {
    const row = rowsOf<{ id: string }>(
      await tx.execute(sql`UPDATE expenseone.recurring_occurrences o SET reserved_at = now(), updated_at = now()
                            FROM expenseone.recurring_expenses r
                           WHERE o.id = ${occurrenceId}::uuid AND r.id = o.recurring_expense_id
                             AND r.submitted_by_id = ${ownerId}::uuid
                             AND NOT EXISTS (SELECT 1 FROM expenseone.expenses e WHERE e.id = o.expense_id)
                             AND (o.reserved_at IS NULL OR o.reserved_at < now() - interval '2 minutes')
                       RETURNING o.id`),
    )[0];
    if (row) return "ok";
    const exists = rowsOf<{ id: string }>(
      await tx.execute(sql`SELECT o.id FROM expenseone.recurring_occurrences o
                             JOIN expenseone.recurring_expenses r ON r.id = o.recurring_expense_id
                            WHERE o.id = ${occurrenceId}::uuid AND r.submitted_by_id = ${ownerId}::uuid`),
    )[0];
    return exists ? "taken" : "not_found";
  });
}

/** 선점을 푼다(입금요청 만들기가 실패했을 때). */
export async function releaseReservation(occurrenceId: string): Promise<void> {
  await withPlanTx(async (tx) => {
    await tx.execute(sql`UPDATE expenseone.recurring_occurrences SET reserved_at = NULL, updated_at = now()
                          WHERE id = ${occurrenceId}::uuid`);
  });
}

/** 자동 제출이 실패했을 때 처리 표시를 되돌린다(다음 cron 이 다시 시도하게). */
export async function releaseOccurrence(occurrenceId: string): Promise<void> {
  await withPlanTx(async (tx) => {
    await tx.execute(sql`UPDATE expenseone.recurring_occurrences SET run_at = NULL, updated_at = now()
                          WHERE id = ${occurrenceId}::uuid AND expense_id IS NULL`);
  });
}

/**
 * 회차에 입금요청을 붙이고, 그 회차에 계획이 있으면 계획에도 연결한다(스냅샷 = 지금 입금요청 값).
 * actorId = 연결한 사람(자동 제출이면 등록자, 사람이 올렸으면 올린 사람).
 * 계획이 취소·삭제·마감이거나 입금요청이 이미 다른 계획에 연결돼 있으면 회차에만 붙이고 계획 연결은 건너뛴다.
 * 이미 다른 입금요청이 붙은 회차면 CONFLICT.
 */
export async function attachExpenseToOccurrence(
  occurrenceId: string,
  expenseId: string,
  actorId: string,
): Promise<{ linkedPlanId: string | null }> {
  return withPlanTx(async (tx) => {
    const occ = rowsOf<{ plan_id: string | null; expense_id: string | null; live_expense: string | null }>(
      await tx.execute(sql`SELECT o.plan_id, o.expense_id,
                                  (SELECT e.id FROM expenseone.expenses e WHERE e.id = o.expense_id) AS live_expense
                             FROM expenseone.recurring_occurrences o
                            WHERE o.id = ${occurrenceId}::uuid
                              FOR UPDATE OF o`),
    )[0];
    if (!occ) throw new PlanError("NOT_FOUND", "반복 회차를 찾을 수 없습니다.");
    if (occ.live_expense && occ.live_expense !== expenseId) {
      throw new PlanError("CONFLICT", "이 회차에는 이미 입금요청이 올라가 있습니다.");
    }
    await tx.execute(sql`UPDATE expenseone.recurring_occurrences
                            SET expense_id = ${expenseId}::uuid, run_at = coalesce(run_at, now()),
                                reserved_at = NULL, updated_at = now()
                          WHERE id = ${occurrenceId}::uuid`);
    if (!occ.plan_id) return { linkedPlanId: null };

    const link = rowsOf<{ id: string; plan_id: string; company_id: string; project_id: string; snapshot_amount: number; snapshot_title: string }>(
      await tx.execute(sql`WITH ins AS (INSERT INTO expenseone.plan_expense_links
            (plan_id, company_id, expense_id, snapshot_amount, snapshot_currency, snapshot_amount_original,
             snapshot_title, snapshot_due_date, snapshot_company_id, snapshot_submitted_at, linked_by_id)
          SELECT p.id, p.company_id, e.id, e.amount, e.currency, e.amount_original,
                 e.title, e.due_date, e.company_id, e.created_at, ${actorId}::uuid
            FROM expenseone.cost_plans p
            JOIN expenseone.expenses e ON e.company_id = p.company_id
           WHERE p.id = ${occ.plan_id}::uuid AND e.id = ${expenseId}::uuid
             AND p.status = 'PLANNED' AND p.deleted_at IS NULL
             AND e.type = 'DEPOSIT_REQUEST' AND e.status NOT IN ('REJECTED', 'CANCELLED')
             AND e.currency = 'KRW'
             AND NOT EXISTS (SELECT 1 FROM expenseone.plan_expense_links x
                              WHERE x.expense_id = e.id AND x.unlinked_at IS NULL)
          RETURNING id, plan_id, company_id, snapshot_amount, snapshot_title)
          SELECT ins.id, ins.plan_id, ins.company_id, p.project_id, ins.snapshot_amount, ins.snapshot_title
            FROM ins JOIN expenseone.cost_plans p ON p.id = ins.plan_id`),
    )[0];
    if (!link) return { linkedPlanId: null };
    await logChange(tx, {
      companyId: link.company_id,
      projectId: link.project_id,
      planId: link.plan_id,
      entityType: "link",
      entityId: link.id,
      action: "LINK",
      actorId,
      after: { expenseId, snapshotAmount: num(link.snapshot_amount), snapshotTitle: link.snapshot_title },
      reason: "반복 지급 회차의 입금요청",
    });
    return { linkedPlanId: link.plan_id };
  });
}

/** 보드 카드·상세에 "반복" 표시를 붙이기 위한 계획 → 반복 id. */
export async function recurringIdsForPlans(tx: PlanTx, planIds: string[]): Promise<Map<string, string>> {
  if (planIds.length === 0) return new Map();
  const rows = rowsOf<{ plan_id: string; recurring_expense_id: string }>(
    await tx.execute(sql`SELECT plan_id, recurring_expense_id FROM expenseone.recurring_occurrences
                          WHERE plan_id IN (${sql.join(planIds.map((id) => sql`${id}::uuid`), sql`, `)})`),
  );
  return new Map(rows.map((r) => [r.plan_id, r.recurring_expense_id]));
}
