import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
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
      slackChannelId: input.slackChannelId ?? null,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  return created;
}

/**
 * Update a company.
 * If setting isActive=false, ensures at least 1 other active company remains.
 */
export async function updateCompany(id: string, input: UpdateCompanyInput) {
  // Guard: cannot deactivate if it's the last active company
  if (input.isActive === false) {
    const [result] = await db
      .select({ count: count() })
      .from(companies)
      .where(and(eq(companies.isActive, true), ne(companies.id, id)));

    if (!result || result.count === 0) {
      throw new Error("최소 1개의 활성 회사가 필요합니다.");
    }
  }

  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name.trim();
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
