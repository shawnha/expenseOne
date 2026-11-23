import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, expenses, users } from "@/lib/db/schema";
import { brandSettlementSubjects, brandSettlementViewers } from "@/lib/db/schema-brand-settlement";
import { rowsOf } from "@/lib/plans/rows";
import type { SettlementSource, SettlementSubject } from "@/lib/validations/brand-settlement";
import type { DocumentType, ExpenseStatus } from "@/types";
import { AppError } from "./attachment.service";

const PAGE_SIZE = 20;

const visibleCompanies = (userId: string) => sql`
  SELECT c.id, c.name, c.sort_order
    FROM expenseone.companies c
    JOIN expenseone.users u ON u.id = ${userId}::uuid AND u.is_active = true
   WHERE c.is_active = true
     AND (u.role = 'ADMIN' OR EXISTS (
       SELECT 1 FROM expenseone.brand_settlement_viewers v
       WHERE v.user_id = u.id AND v.company_id = c.id
     ))`;

export async function getSettlementCompanies(userId: string) {
  return rowsOf<{ id: string; name: string }>(
    await db.execute(sql`SELECT id, name FROM (${visibleCompanies(userId)}) c ORDER BY sort_order, name`),
  );
}

export function getSettlementViewerCompanies(userId: string) {
  return db.select({ companyId: brandSettlementViewers.companyId })
    .from(brandSettlementViewers)
    .where(eq(brandSettlementViewers.userId, userId));
}

export async function saveSettlementViewerCompanies(userId: string, companyIds: string[], grantedById: string) {
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    if (!target) throw new AppError("NOT_FOUND", "사용자를 찾을 수 없습니다.");

    if (companyIds.length > 0) {
      const valid = await tx.select({ id: companies.id }).from(companies)
        .where(and(inArray(companies.id, companyIds), eq(companies.isActive, true)));
      if (valid.length !== companyIds.length) throw new AppError("VALIDATION_ERROR", "활성 법인을 선택해 주세요.");
    }

    // Preserve an existing grant's creator and timestamp. Unchecked grants,
    // including inactive companies, are revoked.
    const granted = await tx.select({ id: brandSettlementViewers.companyId }).from(brandSettlementViewers)
      .where(eq(brandSettlementViewers.userId, userId));
    const next = new Set(companyIds);
    const revoked = granted.filter(({ id }) => !next.has(id)).map(({ id }) => id);
    if (revoked.length > 0) {
      await tx.delete(brandSettlementViewers)
        .where(and(eq(brandSettlementViewers.userId, userId), inArray(brandSettlementViewers.companyId, revoked)));
    }
    if (companyIds.length > 0) {
      await tx.insert(brandSettlementViewers)
        .values(companyIds.map((companyId) => ({ userId, companyId, grantedById })))
        .onConflictDoNothing();
    }
  });
}

export async function getSettlementSubject(source: SettlementSource, id: string, companyId: string) {
  const [subject] = await db.select({
    brandName: brandSettlementSubjects.brandName,
    periodMonth: brandSettlementSubjects.periodMonth,
  })
    .from(brandSettlementSubjects)
    .where(and(
      eq(brandSettlementSubjects.sourceType, source),
      eq(brandSettlementSubjects.sourceId, id),
      eq(brandSettlementSubjects.companyId, companyId),
    ));
  return subject ? { brandName: subject.brandName, month: subject.periodMonth.slice(0, 7) } : null;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function updateSubject(
  tx: Pick<Transaction, "insert" | "delete">,
  source: SettlementSource,
  id: string,
  companyId: string,
  actorId: string,
  subject: SettlementSubject | null,
) {
  if (!subject) {
    await tx.delete(brandSettlementSubjects).where(and(
      eq(brandSettlementSubjects.sourceType, source),
      eq(brandSettlementSubjects.sourceId, id),
    ));
    return;
  }

  const data = {
    companyId,
    brandName: subject.brandName,
    periodMonth: `${subject.month}-01`,
    updatedById: actorId,
    updatedAt: new Date(),
  };
  await tx.insert(brandSettlementSubjects).values({ sourceType: source, sourceId: id, ...data })
    .onConflictDoUpdate({
      target: [brandSettlementSubjects.sourceType, brandSettlementSubjects.sourceId],
      set: data,
    });
}

export async function saveSettlementSubject(
  source: SettlementSource,
  id: string,
  actorId: string,
  subject: SettlementSubject | null,
) {
  if (source === "PLAN") {
    const [{ withPlanTx }, { loadAccess, requirePlanAccess }, { PlanError }] = await Promise.all([
      import("@/lib/db/plans-client"),
      import("@/lib/plans/permissions"),
      import("@/lib/plans/errors"),
    ]);
    await withPlanTx(async (tx) => {
      const access = await loadAccess(tx, { userId: actorId, role: "ADMIN" });
      try {
        const plan = await requirePlanAccess(tx, access, id, { forUpdate: true });
        if (subject && plan.status === "CANCELLED") {
          throw new AppError("VALIDATION_ERROR", "취소된 비용계획은 등록할 수 없습니다.");
        }
        await updateSubject(tx, source, id, plan.companyId, actorId, subject);
      } catch (err) {
        if (err instanceof PlanError && err.code === "NOT_FOUND") {
          throw new AppError("NOT_FOUND", "비용계획을 찾을 수 없습니다.");
        }
        throw err;
      }
    });
    return;
  }

  await db.transaction(async (tx) => {
    const [request] = await tx.select({ companyId: expenses.companyId })
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.type, "DEPOSIT_REQUEST")))
      .for("update");
    if (!request) throw new AppError("NOT_FOUND", "입금요청을 찾을 수 없습니다.");
    await updateSubject(tx, source, id, request.companyId, actorId, subject);
  });
}

export interface SettlementRequest {
  id: string;
  title: string;
  amount: number;
  currency: string;
  amountOriginal: number | null;
  status: ExpenseStatus;
  dueDate: string | null;
  submitterName: string;
  isPrePaid: boolean;
  prePaidPercentage: number | null;
  prePaidFixedAmount: number | null;
  remainingPaymentRequested: boolean;
  remainingPaymentApproved: boolean;
  evidence: DocumentType[];
}

interface SettlementRow {
  id: string;
  source_type: SettlementSource;
  company_name: string;
  brand_name: string;
  title: string;
  planned_on: string | null;
  expected_amount: number | null;
  requests: SettlementRequest[];
  total: number;
}

export async function getSettlementReview(userId: string, filters: {
  month: string;
  companyId?: string;
  search?: string;
  page: number;
}) {
  const { month, companyId, search, page } = filters;
  const searchTerm = search ? `%${search.replace(/[%_\\]/g, "\\$&")}%` : undefined;

  const rows = rowsOf<SettlementRow>(await db.execute(sql`
    WITH companies AS (${visibleCompanies(userId)}),
    subjects AS (
      SELECT s.*, c.name AS company_name
      FROM expenseone.brand_settlement_subjects s JOIN companies c ON c.id = s.company_id
      WHERE s.period_month = ${`${month}-01`}::date
        ${companyId ? sql`AND s.company_id = ${companyId}::uuid` : sql.empty()}
    ),
    review AS (
      SELECT s.source_id AS id, s.source_type, s.company_id, s.company_name, s.brand_name,
             p.title, p.planned_date AS planned_on, p.amount AS expected_amount
      FROM subjects s
      JOIN expenseone.cost_plans p ON p.id = s.source_id AND p.company_id = s.company_id
        AND p.deleted_at IS NULL AND p.status <> 'CANCELLED'
        AND EXISTS (SELECT 1 FROM expenseone.plan_projects j WHERE j.id = p.project_id AND j.deleted_at IS NULL)
      WHERE s.source_type = 'PLAN'
      UNION ALL
      SELECT s.source_id, s.source_type, s.company_id, s.company_name, s.brand_name, e.title, NULL, NULL
      FROM subjects s JOIN expenseone.expenses e ON e.id = s.source_id
        AND e.company_id = s.company_id AND e.type = 'DEPOSIT_REQUEST'
      WHERE s.source_type = 'REQUEST' AND NOT EXISTS (
        SELECT 1
        FROM expenseone.plan_expense_links l
        JOIN subjects ps ON ps.source_id = l.plan_id AND ps.source_type = 'PLAN' AND ps.company_id = l.company_id
        JOIN expenseone.cost_plans p ON p.id = l.plan_id AND p.company_id = l.company_id
          AND p.deleted_at IS NULL AND p.status <> 'CANCELLED'
        AND EXISTS (SELECT 1 FROM expenseone.plan_projects j WHERE j.id = p.project_id AND j.deleted_at IS NULL)
        WHERE l.expense_id = e.id AND l.company_id = e.company_id AND l.unlinked_at IS NULL
      )
    ),
    page AS (
      SELECT *, count(*) OVER ()::int AS total FROM review
      ${searchTerm ? sql`WHERE brand_name ILIKE ${searchTerm} OR title ILIKE ${searchTerm}` : sql.empty()}
      ORDER BY planned_on NULLS LAST, brand_name, id
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}
    )
    SELECT p.id, p.source_type, p.company_name, p.brand_name, p.title,
           p.planned_on::text, p.expected_amount, p.total, COALESCE(r.requests, '[]'::jsonb) AS requests
    FROM page p
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'title', e.title, 'amount', e.amount, 'currency', e.currency, 'amountOriginal', e.amount_original,
        'status', e.status, 'dueDate', e.due_date, 'submitterName', u.name, 'isPrePaid', e.is_pre_paid,
        'prePaidPercentage', e.pre_paid_percentage, 'prePaidFixedAmount', prepaid.amount,
        'remainingPaymentRequested', e.remaining_payment_requested, 'remainingPaymentApproved', e.remaining_payment_approved,
        'evidence', ARRAY(SELECT DISTINCT a.document_type::text FROM expenseone.attachments a WHERE a.expense_id = e.id ORDER BY 1)
      ) ORDER BY e.created_at, e.id) AS requests
      FROM expenseone.expenses e
      JOIN expenseone.users u ON u.id = e.submitted_by_id
      LEFT JOIN expenseone.expense_pre_paid_amounts prepaid ON prepaid.expense_id = e.id
      WHERE e.company_id = p.company_id AND e.type = 'DEPOSIT_REQUEST'
        AND ((p.source_type = 'REQUEST' AND e.id = p.id) OR (
          p.source_type = 'PLAN' AND EXISTS (
            SELECT 1 FROM expenseone.plan_expense_links l
            WHERE l.plan_id = p.id AND l.company_id = p.company_id AND l.expense_id = e.id AND l.unlinked_at IS NULL
          )
        ))
    ) r ON true
    ORDER BY p.planned_on NULLS LAST, p.brand_name, p.id
  `));
  const total = rows[0]?.total ?? 0;
  return { rows, total, totalPages: Math.ceil(total / PAGE_SIZE) };
}
