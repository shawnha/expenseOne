import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { AppError } from "@/services/attachment.service";
import { db } from "@/lib/db";
import {
  type Attachment,
  companies,
  departments,
  expensePrePaidAmounts,
  expenses,
  expenseTeamMembers,
  expenseTeamShares,
  users,
} from "@/lib/db/schema";
import type { ExpenseStatus, ExpenseType } from "@/types";

export function getExpenseTeams(userId: string) {
  return db.select({
    id: departments.id,
    name: departments.name,
    companyId: departments.companyId,
    companyName: companies.name,
  })
    .from(expenseTeamMembers)
    .innerJoin(users, eq(users.id, expenseTeamMembers.userId))
    .innerJoin(departments, eq(departments.id, expenseTeamMembers.departmentId))
    .innerJoin(companies, eq(companies.id, departments.companyId))
    .where(and(eq(expenseTeamMembers.userId, userId), eq(users.isActive, true), eq(companies.isActive, true)))
    .orderBy(asc(companies.name), asc(departments.sortOrder), asc(departments.name));
}

export async function saveExpenseTeams(userId: string, departmentIds: string[]) {
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ id: users.id }).from(users)
      .where(eq(users.id, userId)).for("update");
    if (!target) throw new AppError("NOT_FOUND", "사용자를 찾을 수 없습니다.");

    const previous = await tx.select({ id: departments.id, companyId: departments.companyId })
      .from(expenseTeamMembers)
      .innerJoin(departments, eq(departments.id, expenseTeamMembers.departmentId))
      .innerJoin(companies, eq(companies.id, departments.companyId))
      .where(and(eq(expenseTeamMembers.userId, userId), eq(companies.isActive, true)));
    const requested = new Set(departmentIds);
    const previouslySelected = new Set(previous.map((team) => team.id));
    if (previous.length === departmentIds.length && previous.every((team) => requested.has(team.id))) return;

    const changedCompanies = new Set(previous.filter((team) => !requested.has(team.id)).map((team) => team.companyId));
    if (departmentIds.length > 0) {
      const valid = await tx.select({ id: departments.id, companyId: departments.companyId }).from(departments)
        .innerJoin(companies, eq(companies.id, departments.companyId))
        .where(and(inArray(departments.id, departmentIds), eq(companies.isActive, true)));
      if (valid.length !== departmentIds.length) {
        throw new AppError("VALIDATION_ERROR", "사용 가능한 팀을 선택해 주세요.");
      }
      for (const team of valid) {
        if (!previouslySelected.has(team.id)) changedCompanies.add(team.companyId);
      }
    }

    for (const companyId of changedCompanies) {
      const oldTeams = previous.filter((team) => team.companyId === companyId);
      if (oldTeams.length === 0) continue;

      // Keep older expenses with their original scope when a team changes.
      // Ambiguous older expenses remain private until someone chooses a team.
      const departmentId = oldTeams.length === 1 ? oldTeams[0].id : null;
      await tx.execute(sql`
        INSERT INTO ${expenseTeamShares} (expense_id, department_id)
        SELECT ${expenses.id}, ${departmentId}::uuid FROM ${expenses}
        WHERE ${expenses.submittedById} = ${userId} AND ${expenses.companyId} = ${companyId}
          AND NOT EXISTS (
            SELECT 1 FROM ${expenseTeamShares} WHERE ${expenseTeamShares.expenseId} = ${expenses.id}
          )
        FOR KEY SHARE
        ON CONFLICT (expense_id) DO NOTHING
      `);
    }

    // Preserve inactive-company memberships, which are hidden in this editor.
    const editableDepartments = tx.select({ id: departments.id }).from(departments)
      .innerJoin(companies, eq(companies.id, departments.companyId)).where(eq(companies.isActive, true));
    await tx.delete(expenseTeamMembers).where(and(
      eq(expenseTeamMembers.userId, userId),
      inArray(expenseTeamMembers.departmentId, editableDepartments),
    ));
    if (departmentIds.length > 0) {
      await tx.insert(expenseTeamMembers).values(departmentIds.map((departmentId) => ({ userId, departmentId })));
    }
  });
}

export async function getExpenseShareSettings(expense: { id: string; submittedById: string; companyId: string }) {
  const [teams, [share]] = await Promise.all([
    getExpenseTeams(expense.submittedById),
    db.select({ departmentId: expenseTeamShares.departmentId }).from(expenseTeamShares)
      .where(eq(expenseTeamShares.expenseId, expense.id)),
  ]);
  return { teams: teams.filter((team) => team.companyId === expense.companyId), share };
}

export async function saveExpenseShare(
  expenseId: string,
  viewer: { id: string; role: "MEMBER" | "ADMIN" },
  departmentId: string | null | "auto",
) {
  await db.transaction(async (tx) => {
    const [expense] = await tx.select({ userId: expenses.submittedById, companyId: expenses.companyId })
      .from(expenses).where(eq(expenses.id, expenseId)).for("update");

    if (!expense || (expense.userId !== viewer.id && viewer.role !== "ADMIN")) {
      throw new AppError("NOT_FOUND", "비용을 찾을 수 없습니다.");
    }
    if (departmentId === "auto") {
      await tx.delete(expenseTeamShares).where(eq(expenseTeamShares.expenseId, expenseId));
      return;
    }
    if (departmentId !== null) {
      const [team] = await tx.select({ id: departments.id }).from(expenseTeamMembers)
        .innerJoin(departments, eq(departments.id, expenseTeamMembers.departmentId))
        .innerJoin(companies, eq(companies.id, departments.companyId))
        .where(and(
          eq(expenseTeamMembers.userId, expense.userId),
          eq(departments.id, departmentId),
          eq(departments.companyId, expense.companyId),
          eq(companies.isActive, true),
        ));
      if (!team) throw new AppError("VALIDATION_ERROR", "이 비용을 공유할 수 있는 팀을 선택해 주세요.");
    }
    await tx.insert(expenseTeamShares).values({ expenseId, departmentId })
      .onConflictDoUpdate({ target: expenseTeamShares.expenseId, set: { departmentId } });
  });
}

const PAGE_SIZE = 20;

export async function getTeamExpenseList(userId: string, filters: {
  teamId?: string;
  type?: ExpenseType;
  status?: ExpenseStatus;
  search?: string;
  page: number;
}) {
  const { teamId, type, status, search, page } = filters;
  const searchTerm = search ? `%${search.replace(/[%_\\]/g, "\\$&")}%` : undefined;

  // A share must match the recorded legal entity and a team of both people.
  // Rows without a sharing choice are visible only when the author has one
  // confirmed team in that legal entity. A NULL choice explicitly opts out.
  const eligibleTeam = sql`EXISTS (
    SELECT 1
    FROM expenseone.expense_team_members AS viewer_team
    JOIN expenseone.users AS viewer ON viewer.id = viewer_team.user_id AND viewer.is_active
    JOIN expenseone.departments AS team ON team.id = viewer_team.department_id
    JOIN expenseone.companies AS company ON company.id = team.company_id AND company.is_active
    JOIN expenseone.expense_team_members AS author_team ON author_team.department_id = team.id
      AND author_team.user_id = ${expenses.submittedById}
    WHERE viewer_team.user_id = ${userId}
      AND team.company_id = ${expenses.companyId}
      ${teamId ? sql`AND team.id = ${teamId}` : sql.empty()}
      AND (
        ${expenseTeamShares.departmentId} = team.id
        OR (
          ${expenseTeamShares.expenseId} IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM expenseone.expense_team_members AS other_team
            JOIN expenseone.departments AS other_department ON other_department.id = other_team.department_id
            WHERE other_team.user_id = author_team.user_id
              AND other_department.company_id = team.company_id
              AND other_department.id <> team.id
          )
        )
      )
  )`;

  const conditions = and(
    eligibleTeam,
    type ? eq(expenses.type, type) : undefined,
    status ? eq(expenses.status, status) : undefined,
    searchTerm ? or(ilike(expenses.title, searchTerm), ilike(users.name, searchTerm), ilike(expenses.merchantName, searchTerm)) : undefined,
  );
  const [rows, [totalRow]] = await Promise.all([
    db.select({
      id: expenses.id,
      title: expenses.title,
      type: expenses.type,
      status: expenses.status,
      amount: expenses.amount,
      currency: expenses.currency,
      amountOriginal: expenses.amountOriginal,
      category: expenses.category,
      merchantName: expenses.merchantName,
      transactionDate: expenses.transactionDate,
      dueDate: expenses.dueDate,
      isPrePaid: expenses.isPrePaid,
      prePaidPercentage: expenses.prePaidPercentage,
      prePaidFixedAmount: expensePrePaidAmounts.amount,
      hasFreelancerWithholding: expenses.hasFreelancerWithholding,
      remainingPaymentRequested: expenses.remainingPaymentRequested,
      remainingPaymentApproved: expenses.remainingPaymentApproved,
      companyName: companies.name,
      submitterName: users.name,
      evidence: sql<Attachment["documentType"][]>`ARRAY(
        SELECT DISTINCT a.document_type::text FROM expenseone.attachments a
        WHERE a.expense_id = ${expenses.id}
        ORDER BY 1
      )`.as("evidence"),
    })
      .from(expenses)
      .innerJoin(users, eq(users.id, expenses.submittedById))
      .innerJoin(companies, eq(companies.id, expenses.companyId))
      .leftJoin(expenseTeamShares, eq(expenseTeamShares.expenseId, expenses.id))
      .leftJoin(expensePrePaidAmounts, eq(expensePrePaidAmounts.expenseId, expenses.id))
      .where(conditions)
      .orderBy(desc(expenses.createdAt), desc(expenses.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(expenses)
      .innerJoin(users, eq(users.id, expenses.submittedById))
      .leftJoin(expenseTeamShares, eq(expenseTeamShares.expenseId, expenses.id))
      .where(conditions),
  ]);

  return { rows, total: totalRow.total, totalPages: Math.ceil(totalRow.total / PAGE_SIZE) };
}
