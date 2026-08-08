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
 * - 통화는 바꿀 수 있다. 새 비용의 기본 통화만 바뀌고 기존 행은 그대로다.
 * - slug는 아예 바꿀 수 없다(스키마에서 제외 — 환경변수 이름이자 조회 키).
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

  // 통화 변경은 막지 않는다 — 과거 데이터를 건드리지 않기 때문이다.
  //
  // 처음엔 "비용이 있으면 차단"으로 넣었는데 근거가 틀렸다. expenses.amount는
  // **항상 KRW**로 저장되고(expense.service.ts가 USD를 환산해 넣고 원본 센트는
  // amountOriginal에 둔다), 행마다 자기 currency를 갖는다. 표시도 행의 값을
  // 읽는다. companies.currency는 **새 비용을 등록할 때의 기본값**으로만 쓰인다
  // (expense.service.ts의 companyCurrency). 그래서 바꿔도 기존 행은 그대로다.
  //
  // 차단해두면 오히려 이 기능을 만든 이유(HOI가 USD인데 UI로는 KRW만 만들 수
  // 있었다)와 같은 함정을 비용 1건 뒤에 다시 만든다.

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
