import { db } from "@/lib/db";
import { companies, expenses } from "@/lib/db/schema";
import { eq, asc, and, ne, count } from "drizzle-orm";
import type {
  CreateCompanyInput,
  UpdateCompanyInput,
} from "@/lib/validations/company";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Active companies ordered by sortOrder, name */
export async function getActiveCompanies() {
  return db
    .select()
    .from(companies)
    .where(eq(companies.isActive, true))
    .orderBy(asc(companies.sortOrder), asc(companies.name));
}

/** All companies (including inactive) ordered by sortOrder, name */
export async function getAllCompanies() {
  return db
    .select()
    .from(companies)
    .orderBy(asc(companies.sortOrder), asc(companies.name));
}

/** Single company by id, or null */
export async function getCompanyById(id: string) {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, id));
  return company ?? null;
}

/** Single company by slug, or null */
export async function getCompanyBySlug(slug: string) {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.slug, slug));
  return company ?? null;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a new company */
export async function createCompany(input: CreateCompanyInput) {
  const [created] = await db
    .insert(companies)
    .values({
      name: input.name.trim(),
      slug: input.slug.trim(),
      currency: input.currency ?? "KRW",
      slackChannelId: input.slackChannelId ?? null,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return created;
}

/** 회사 수정이 막힌 이유를 API가 400으로 내려보내기 위한 표식. */
export class CompanyUpdateBlockedError extends Error {}

/**
 * Update a company.
 * - isActive=false로 바꿀 땐 다른 활성 회사가 최소 1개 남아야 한다.
 * - 통화는 비용이 하나도 없을 때만 바꿀 수 있다.
 * - slug는 아예 바꿀 수 없다(스키마에서 제외).
 */
export async function updateCompany(id: string, input: UpdateCompanyInput) {
  // Guard: cannot deactivate if it's the last active company
  if (input.isActive === false) {
    const [result] = await db
      .select({ count: count() })
      .from(companies)
      .where(and(eq(companies.isActive, true), ne(companies.id, id)));

    if (!result || result.count === 0) {
      throw new CompanyUpdateBlockedError("최소 1개의 활성 회사가 필요합니다.");
    }
  }

  // Guard: 비용이 이미 있으면 통화를 못 바꾼다.
  //
  // amount는 회사 통화 기준으로 저장돼 있다(USD는 센트 정수). 통화만 바꾸면
  // 과거 금액이 조용히 다른 뜻이 되어 집계·리포트·세무 CSV가 전부 틀어진다.
  // 되돌릴 방법도 없으므로 아예 막는다.
  if (input.currency !== undefined) {
    const [current] = await db
      .select({ currency: companies.currency })
      .from(companies)
      .where(eq(companies.id, id));

    if (current && current.currency !== input.currency) {
      const [used] = await db
        .select({ count: count() })
        .from(expenses)
        .where(eq(expenses.companyId, id));

      if (used && used.count > 0) {
        throw new CompanyUpdateBlockedError(
          `이미 비용 ${used.count}건이 등록된 회사는 통화를 바꿀 수 없습니다.`,
        );
      }
    }
  }

  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name.trim();
  if (input.currency !== undefined) updateData.currency = input.currency;
  if (input.slackChannelId !== undefined)
    updateData.slackChannelId = input.slackChannelId;
  if (input.sortOrder !== undefined) updateData.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;
  updateData.updatedAt = new Date();

  const [updated] = await db
    .update(companies)
    .set(updateData)
    .where(eq(companies.id, id))
    .returning();

  return updated ?? null;
}
