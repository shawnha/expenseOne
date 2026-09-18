import { eq, inArray, sql, type SQL } from "drizzle-orm";
import { withPlanTx, type PlanTx } from "@/lib/db/plans-client";
import {
  costPlans,
  planBrands,
  planChangeLog,
  planCommentReads,
  planComments,
  planProjectMembers,
  planProjects,
} from "@/lib/db/schema-plans";
import { users } from "@/lib/db/schema";
import { PlanError, mapDbError } from "@/lib/plans/errors";
import { num, rowsOf } from "@/lib/plans/rows";
import {
  canEditComment,
  canLinkAllCompanyRequests,
  canRemoveMember,
  loadAccess,
  projectScopeSql,
  requireExecutive,
  requirePlanAccess,
  requireProjectAccess,
  type PlanAccess,
} from "@/lib/plans/permissions";
import {
  computeLinkDiff,
  currentMonthKST,
  groupByMonth,
  monthRange,
  normalizePlannedDate,
  plannedDateLabel,
  type DatePrecision,
  type LinkForDiff,
} from "@/lib/plans/diff";
import type {
  BoardQueryInput,
  CancelPlanInput,
  CommentBodyInput,
  CreateBrandInput,
  CreatePlanInput,
  CreateProjectInput,
  UpdatePlanInput,
} from "@/lib/validations/plan";

// ---------------------------------------------------------------------------
// 비용계획 서비스 (SCHEMA.md 4·5절)
//
// 규칙:
//   - DB 는 plans-client 의 withPlanTx 로만. 조회는 readOnly 트랜잭션, 쓰기는 한 트랜잭션에
//     [권한] → [변경] → [plan_change_log INSERT] (5절 2).
//   - cost_plans UPDATE 는 항상 `version = version + 1 … WHERE version = $expected`, 0행이면 409.
//   - 권한 근거는 대표 행 또는 참여자 행뿐. created_by_id·users.role 은 근거가 아니다(3절).
//   - 응답에 users.name 말고 다른 사람 정보는 넣지 않는다(5절 9).
//   - expenses·users 는 **읽기만** 한다. 이 파일에 UPDATE/DELETE/INSERT 대상이 되는 기존 표는 없다(P7·P18).
//   - 알림·Slack·푸시를 부르지 않는다. 계획은 첫 출시에서 아무 알림도 보내지 않는다.
// ---------------------------------------------------------------------------

export interface PlanActorInput {
  id: string;
  role: "MEMBER" | "ADMIN";
}

const actorAccess = (actor: PlanActorInput) => ({ userId: actor.id, role: actor.role });

// --- 공통 헬퍼 ------------------------------------------------------------------

type LogEntityType = "project" | "member" | "plan" | "link" | "comment" | "brand";
type LogAction = "CREATE" | "UPDATE" | "DELETE" | "LINK" | "UNLINK" | "ADD" | "REMOVE";

interface LogEntry {
  companyId: string;
  projectId?: string | null;
  planId?: string | null;
  entityType: LogEntityType;
  entityId: string;
  action: LogAction;
  actorId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

/**
 * 이력은 추가만 한다(UPDATE·DELETE 없음). companyId 는 항상 계획·사업의 법인이어야 한다 —
 * 다르면 복합 FK 가 거부한다(V-SECURITY-3, T21).
 */
async function logChange(tx: PlanTx, entry: LogEntry): Promise<void> {
  await tx.insert(planChangeLog).values({
    companyId: entry.companyId,
    projectId: entry.projectId ?? null,
    planId: entry.planId ?? null,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    actorId: entry.actorId,
    beforeData: entry.before ?? null,
    afterData: entry.after ?? null,
    reason: entry.reason ?? null,
  });
}

/** unique 위반(23505)만 뜻이 통하는 문장으로 바꾼다. 나머지는 기존 매핑 그대로. */
function asConflict(err: unknown, message: string): unknown {
  if ((err as { code?: unknown } | null)?.code === "23505") return new PlanError("CONFLICT", message);
  return mapDbError(err);
}

export interface CompanyOption {
  id: string;
  name: string;
  slug: string;
}

/** 첫 출시 범위: 활성 + KRW 법인만(Q9). HOI(USD)는 목록에 나오지 않는다. */
async function loadPlannableCompanies(tx: PlanTx): Promise<CompanyOption[]> {
  const rows = rowsOf<{ id: string; name: string; slug: string }>(
    await tx.execute(sql`SELECT c.id, c.name, c.slug
        FROM expenseone.companies c
       WHERE c.is_active = true AND c.currency = 'KRW'
       ORDER BY c.sort_order, c.name`),
  );
  return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug }));
}

async function assertPlannableCompany(tx: PlanTx, companyId: string): Promise<void> {
  const rows = rowsOf<{ ok: boolean }>(
    await tx.execute(sql`SELECT EXISTS (
        SELECT 1 FROM expenseone.companies c
         WHERE c.id = ${companyId}::uuid AND c.is_active = true AND c.currency = 'KRW') AS ok`),
  );
  if (rows[0]?.ok !== true) {
    throw new PlanError("VALIDATION_ERROR", "비용계획을 쓸 수 없는 법인입니다.");
  }
}

/** 브랜드는 같은 법인의 활성 브랜드만 고를 수 있다(복합 FK 는 법인만 강제, 활성 여부는 서버가). */
async function assertBrandInCompany(tx: PlanTx, brandId: string, companyId: string): Promise<void> {
  const rows = rowsOf<{ ok: boolean }>(
    await tx.execute(sql`SELECT EXISTS (
        SELECT 1 FROM expenseone.plan_brands b
         WHERE b.id = ${brandId}::uuid AND b.company_id = ${companyId}::uuid AND b.is_active = true) AS ok`),
  );
  if (rows[0]?.ok !== true) {
    throw new PlanError("VALIDATION_ERROR", "그 법인의 브랜드가 아닙니다.");
  }
}

// --- 직원 목록 -------------------------------------------------------------------

export interface UserOption {
  id: string;
  name: string;
}

/** 참여자 추가 다이얼로그용. **id 와 이름만** 준다(이메일·부서·카드 끝자리 금지, 5절 9). */
export async function listPlanUsers(actor: PlanActorInput): Promise<UserOption[]> {
  return withPlanTx(async (tx) => {
    await loadAccess(tx, actorAccess(actor));
    const rows = rowsOf<{ id: string; name: string }>(
      await tx.execute(sql`SELECT u.id, u.name FROM expenseone.users u
                            WHERE u.is_active = true ORDER BY u.name`),
    );
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }, { readOnly: true });
}

// --- 프로젝트 --------------------------------------------------------------------

export interface ProjectSummary {
  id: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  name: string;
  description: string | null;
  createdAt: string;
  members: UserOption[];
}

export interface ProjectListResult {
  projects: ProjectSummary[];
  companies: CompanyOption[];
  isExecutive: boolean;
}

async function loadProjectsInScope(
  tx: PlanTx,
  access: PlanAccess,
  companyId?: string,
): Promise<ProjectSummary[]> {
  const companyFilter = companyId ? sql` AND j.company_id = ${companyId}::uuid` : sql``;
  const rows = rowsOf<{
    id: string;
    company_id: string;
    company_name: string;
    company_slug: string;
    name: string;
    description: string | null;
    created_at: Date;
  }>(
    await tx.execute(sql`SELECT j.id, j.company_id, c.name AS company_name, c.slug AS company_slug,
                                j.name, j.description, j.created_at
        FROM expenseone.plan_projects j
        JOIN expenseone.companies c ON c.id = j.company_id
       WHERE j.deleted_at IS NULL AND c.is_active = true AND c.currency = 'KRW'
         AND ${projectScopeSql(access, sql`j.id`)}${companyFilter}
       ORDER BY c.sort_order, j.name`),
  );
  if (rows.length === 0) return [];

  // 참여자는 드리즐 빌더로 — sql 템플릿에 배열을 넣으면 `($1, $2)`(행 생성자)로 펼쳐져
  // `= ANY(...)` 가 42846 으로 죽는다(운영 DB 에서 확인). inArray 는 `IN ($1, $2)` 를 만든다.
  const ids = rows.map((r) => r.id);
  const memberRows = await tx
    .select({
      projectId: planProjectMembers.projectId,
      userId: planProjectMembers.userId,
      name: users.name,
    })
    .from(planProjectMembers)
    .innerJoin(users, eq(users.id, planProjectMembers.userId))
    .where(inArray(planProjectMembers.projectId, ids))
    .orderBy(users.name);
  const byProject = new Map<string, UserOption[]>();
  for (const m of memberRows) {
    const list = byProject.get(m.projectId) ?? [];
    list.push({ id: m.userId, name: m.name });
    byProject.set(m.projectId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    companyName: r.company_name,
    companySlug: r.company_slug,
    name: r.name,
    description: r.description,
    createdAt: new Date(r.created_at).toISOString(),
    members: byProject.get(r.id) ?? [],
  }));
}

export async function listProjects(actor: PlanActorInput, companyId?: string): Promise<ProjectListResult> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    const projects = await loadProjectsInScope(tx, access, companyId);
    const companies = await loadPlannableCompanies(tx);
    return { projects, companies, isExecutive: access.isExecutive };
  }, { readOnly: true });
}

/**
 * 사업 만들기: 진입한 누구나, 활성 KRW 법인에. **같은 트랜잭션에서 본인을 참여자로 INSERT** 한다 —
 * 이 행이 유일한 권한 근거라서 빠지면 만든 사람도 자기 사업을 못 본다(SCHEMA.md 3절).
 */
export async function createProject(actor: PlanActorInput, input: CreateProjectInput): Promise<ProjectSummary> {
  return withPlanTx(async (tx) => {
    await assertPlannableCompany(tx, input.companyId);
    let projectId: string;
    try {
      const [created] = await tx
        .insert(planProjects)
        .values({
          companyId: input.companyId,
          name: input.name,
          description: input.description,
          createdById: actor.id,
        })
        .returning({ id: planProjects.id });
      projectId = created.id;
    } catch (err) {
      throw asConflict(err, "같은 이름의 프로젝트가 이미 있습니다.");
    }

    await tx.insert(planProjectMembers).values({
      projectId,
      userId: actor.id,
      addedById: actor.id,
    });
    await logChange(tx, {
      companyId: input.companyId,
      projectId,
      entityType: "project",
      entityId: projectId,
      action: "CREATE",
      actorId: actor.id,
      after: { name: input.name, description: input.description, companyId: input.companyId },
    });
    await logChange(tx, {
      companyId: input.companyId,
      projectId,
      entityType: "member",
      entityId: actor.id,
      action: "ADD",
      actorId: actor.id,
      after: { userId: actor.id, source: "creator" },
    });

    // 방금 넣은 참여자 행이 같은 트랜잭션에서 보이므로 대표가 아니어도 자기 사업이 잡힌다.
    const access: PlanAccess = { userId: actor.id, role: actor.role, isExecutive: false };
    const summary = (await loadProjectsInScope(tx, access, input.companyId)).find((p) => p.id === projectId);
    if (!summary) throw new PlanError("INTERNAL_ERROR", "프로젝트를 만들지 못했습니다.");
    return summary;
  });
}

// --- 참여자 ----------------------------------------------------------------------

export async function addProjectMember(
  actor: PlanActorInput,
  projectId: string,
  userId: string,
): Promise<UserOption[]> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    const project = await requireProjectAccess(tx, access, projectId);

    const target = rowsOf<{ id: string; name: string }>(
      await tx.execute(sql`SELECT u.id, u.name FROM expenseone.users u
                            WHERE u.id = ${userId}::uuid AND u.is_active = true`),
    )[0];
    if (!target) throw new PlanError("VALIDATION_ERROR", "직원을 찾을 수 없습니다.");

    const inserted = await tx
      .insert(planProjectMembers)
      .values({ projectId, userId, addedById: actor.id })
      .onConflictDoNothing()
      .returning({ userId: planProjectMembers.userId });
    if (inserted.length === 0) {
      throw new PlanError("CONFLICT", "이미 참여 중인 직원입니다.");
    }

    await logChange(tx, {
      companyId: project.companyId,
      projectId,
      entityType: "member",
      entityId: userId,
      action: "ADD",
      actorId: actor.id,
      after: { userId },
    });
    return loadProjectMembers(tx, projectId);
  });
}

/** 마지막 참여자는 제거할 수 없다(409) — 아무도 들어갈 수 없는 사업이 생기는 것을 막는다(5절 4-1). */
export async function removeProjectMember(
  actor: PlanActorInput,
  projectId: string,
  userId: string,
): Promise<UserOption[]> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    const project = await requireProjectAccess(tx, access, projectId);

    // 동시에 두 사람이 제거하면 둘 다 "2명 남음"을 보고 둘 다 지울 수 있다.
    // 사업 행을 먼저 잠가 같은 사업의 참여자 변경을 한 줄로 세운다. (집계에는 FOR UPDATE 를 못 쓴다)
    await tx.execute(sql`SELECT 1 FROM expenseone.plan_projects j
                          WHERE j.id = ${projectId}::uuid FOR UPDATE`);
    const count = num(
      rowsOf<{ n: number }>(
        await tx.execute(sql`SELECT count(*)::int AS n FROM expenseone.plan_project_members m
                              WHERE m.project_id = ${projectId}::uuid`),
      )[0]?.n,
    );
    if (!canRemoveMember(count)) {
      throw new PlanError("CONFLICT", "마지막 참여자는 제거할 수 없습니다.");
    }

    const removed = rowsOf<{ user_id: string }>(
      await tx.execute(sql`DELETE FROM expenseone.plan_project_members m
                            WHERE m.project_id = ${projectId}::uuid AND m.user_id = ${userId}::uuid
                        RETURNING m.user_id`),
    );
    if (removed.length === 0) throw new PlanError("NOT_FOUND", "참여자를 찾을 수 없습니다.");

    await logChange(tx, {
      companyId: project.companyId,
      projectId,
      entityType: "member",
      entityId: userId,
      action: "REMOVE",
      actorId: actor.id,
      before: { userId },
    });
    return loadProjectMembers(tx, projectId);
  });
}

async function loadProjectMembers(tx: PlanTx, projectId: string): Promise<UserOption[]> {
  const rows = rowsOf<{ id: string; name: string }>(
    await tx.execute(sql`SELECT u.id, u.name
        FROM expenseone.plan_project_members m
        JOIN expenseone.users u ON u.id = m.user_id
       WHERE m.project_id = ${projectId}::uuid ORDER BY u.name`),
  );
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

// --- 브랜드 ----------------------------------------------------------------------

export interface BrandOption {
  id: string;
  companyId: string;
  name: string;
  categoryCode: string | null;
  isActive: boolean;
}

async function loadBrands(tx: PlanTx, companyId?: string, includeInactive = false): Promise<BrandOption[]> {
  const companyFilter = companyId ? sql` AND b.company_id = ${companyId}::uuid` : sql``;
  const activeFilter = includeInactive ? sql`` : sql` AND b.is_active = true`;
  const rows = rowsOf<{
    id: string;
    company_id: string;
    name: string;
    category_code: string | null;
    is_active: boolean;
  }>(
    await tx.execute(sql`SELECT b.id, b.company_id, b.name, b.category_code, b.is_active
        FROM expenseone.plan_brands b
        JOIN expenseone.companies c ON c.id = b.company_id
       WHERE c.is_active = true AND c.currency = 'KRW'${companyFilter}${activeFilter}
       ORDER BY c.sort_order, b.sort_order, b.name`),
  );
  return rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    name: r.name,
    categoryCode: r.category_code,
    isActive: r.is_active,
  }));
}

export async function listBrands(
  actor: PlanActorInput,
  companyId?: string,
  includeInactive = false,
): Promise<BrandOption[]> {
  return withPlanTx(async (tx) => {
    await loadAccess(tx, actorAccess(actor));
    return loadBrands(tx, companyId, includeInactive);
  }, { readOnly: true });
}

/** 브랜드 등록은 대표만(SCHEMA.md 3절). 첫 출시엔 관리 화면 없이 계획 다이얼로그의 인라인 추가만 쓴다. */
export async function createBrand(actor: PlanActorInput, input: CreateBrandInput): Promise<BrandOption> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    requireExecutive(access);
    await assertPlannableCompany(tx, input.companyId);

    let brandId: string;
    try {
      const [created] = await tx
        .insert(planBrands)
        .values({
          companyId: input.companyId,
          name: input.name,
          categoryCode: input.categoryCode,
          createdById: actor.id,
        })
        .returning({ id: planBrands.id });
      brandId = created.id;
    } catch (err) {
      throw asConflict(err, "같은 이름의 브랜드가 이미 있습니다.");
    }

    await logChange(tx, {
      companyId: input.companyId,
      entityType: "brand",
      entityId: brandId,
      action: "CREATE",
      actorId: actor.id,
      after: { name: input.name, categoryCode: input.categoryCode },
    });

    const brand = (await loadBrands(tx, input.companyId, true)).find((b) => b.id === brandId);
    if (!brand) throw new PlanError("INTERNAL_ERROR", "브랜드를 만들지 못했습니다.");
    return brand;
  });
}

// --- 계획 항목 -------------------------------------------------------------------

export interface PlanCard {
  id: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  projectId: string;
  projectName: string;
  brandId: string | null;
  brandName: string | null;
  title: string;
  amount: number;
  plannedDate: string;
  datePrecision: DatePrecision;
  plannedDateLabel: string;
  status: string;
  version: number;
  vendorName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  linkCount: number;
  requestedSum: number;
  diff: number;
  unreadComments: number;
}

interface CardFilters {
  fromDate: string;
  toDate: string;
  companyId?: string;
  projectId?: string;
  brandId?: string;
  status: "PLANNED" | "ALL";
}

/**
 * (b) 목록/보드 한 문장. 연결 합계(스냅샷 고정)와 읽지 않은 메모 수를 LATERAL 로 같이 가져온다.
 * 범위 술어는 항상 projectScopeSql — 대표가 아니면 참여 중인 사업의 항목만 나온다.
 */
async function loadPlanCards(tx: PlanTx, access: PlanAccess, f: CardFilters): Promise<PlanCard[]> {
  const statusFilter = f.status === "ALL" ? sql`` : sql` AND p.status = 'PLANNED'`;
  const companyFilter = f.companyId ? sql` AND p.company_id = ${f.companyId}::uuid` : sql``;
  const projectFilter = f.projectId ? sql` AND p.project_id = ${f.projectId}::uuid` : sql``;
  const brandFilter =
    f.brandId === undefined
      ? sql``
      : f.brandId === "none"
        ? sql` AND p.brand_id IS NULL`
        : sql` AND p.brand_id = ${f.brandId}::uuid`;

  const rows = rowsOf<{
    id: string;
    company_id: string;
    company_name: string;
    company_slug: string;
    project_id: string;
    project_name: string;
    brand_id: string | null;
    brand_name: string | null;
    title: string;
    amount: number;
    planned_date: string;
    date_precision: string;
    status: string;
    version: number;
    vendor_name: string | null;
    created_by_id: string | null;
    owner_name: string | null;
    link_count: number;
    requested_sum: string | number;
    diff: string | number;
    unread: number;
  }>(
    await tx.execute(sql`SELECT p.id, p.company_id, c.name AS company_name, c.slug AS company_slug,
                                p.project_id, j.name AS project_name,
                                p.brand_id, b.name AS brand_name,
                                p.title, p.amount, p.planned_date::text AS planned_date,
                                p.date_precision, p.status, p.version, p.vendor_name,
                                p.created_by_id, u.name AS owner_name,
                                coalesce(l.link_count, 0)::int AS link_count,
                                coalesce(l.requested_sum, 0)::bigint AS requested_sum,
                                (p.amount - coalesce(l.requested_sum, 0))::bigint AS diff,
                                coalesce(n.unread, 0)::int AS unread
        FROM expenseone.cost_plans p
        JOIN expenseone.companies c ON c.id = p.company_id
        JOIN expenseone.plan_projects j ON j.id = p.project_id
        LEFT JOIN expenseone.plan_brands b ON b.id = p.brand_id
        LEFT JOIN expenseone.users u ON u.id = p.created_by_id
        LEFT JOIN LATERAL (
          SELECT sum(x.snapshot_amount) AS requested_sum, count(*) AS link_count
            FROM expenseone.plan_expense_links x
           WHERE x.plan_id = p.id AND x.unlinked_at IS NULL
        ) l ON true
        LEFT JOIN LATERAL (
          SELECT count(*) AS unread
            FROM expenseone.plan_comments cm
            LEFT JOIN expenseone.plan_comment_reads r
                   ON r.plan_id = cm.plan_id AND r.user_id = ${access.userId}::uuid
           WHERE cm.plan_id = p.id AND cm.deleted_at IS NULL
             AND cm.author_id IS DISTINCT FROM ${access.userId}::uuid
             AND cm.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
        ) n ON true
       WHERE p.deleted_at IS NULL
         AND p.planned_date >= ${f.fromDate}::date AND p.planned_date < ${f.toDate}::date
         AND ${projectScopeSql(access, sql`p.project_id`)}${statusFilter}${companyFilter}${projectFilter}${brandFilter}
       ORDER BY p.planned_date, p.created_at`),
  );

  return rows.map((r) => {
    const precision = (r.date_precision === "MONTH" ? "MONTH" : "DAY") as DatePrecision;
    return {
      id: r.id,
      companyId: r.company_id,
      companyName: r.company_name,
      companySlug: r.company_slug,
      projectId: r.project_id,
      projectName: r.project_name,
      brandId: r.brand_id,
      brandName: r.brand_name,
      title: r.title,
      amount: num(r.amount),
      plannedDate: r.planned_date,
      datePrecision: precision,
      plannedDateLabel: plannedDateLabel(r.planned_date, precision),
      status: r.status,
      version: num(r.version),
      vendorName: r.vendor_name,
      ownerId: r.created_by_id,
      ownerName: r.owner_name,
      linkCount: num(r.link_count),
      requestedSum: num(r.requested_sum),
      diff: num(r.diff),
      unreadComments: num(r.unread),
    };
  });
}

export interface BoardMonth {
  month: string;
  total: number;
  count: number;
  items: PlanCard[];
}

export interface BoardResult {
  from: string;
  monthCount: number;
  months: BoardMonth[];
  isExecutive: boolean;
  companies: CompanyOption[];
  projects: Array<{ id: string; name: string; companyId: string }>;
  brands: BrandOption[];
}

/** 월별 보드. 달 묶기·합계는 순수 함수(diff.ts)로 — 취소·마감은 합계에서 빠진다. */
export async function getBoard(actor: PlanActorInput, query: BoardQueryInput): Promise<BoardResult> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    const from = query.from ?? currentMonthKST();
    const range = monthRange(from, query.months);
    const items = await loadPlanCards(tx, access, {
      fromDate: range.fromDate,
      toDate: range.toDate,
      companyId: query.companyId,
      projectId: query.projectId,
      brandId: query.brandId,
      status: query.status,
    });
    const projects = await loadProjectsInScope(tx, access, query.companyId);
    const companies = await loadPlannableCompanies(tx);
    const brands = await loadBrands(tx, query.companyId);

    return {
      from,
      monthCount: range.keys.length,
      months: groupByMonth(items, range.keys),
      isExecutive: access.isExecutive,
      companies,
      projects: projects.map((p) => ({ id: p.id, name: p.name, companyId: p.companyId })),
      brands,
    };
  }, { readOnly: true });
}

/** 평평한 목록(같은 필터). 보드와 달리 달로 묶지 않는다. */
export async function listPlanItems(actor: PlanActorInput, query: BoardQueryInput): Promise<{ items: PlanCard[] }> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    const from = query.from ?? currentMonthKST();
    const range = monthRange(from, query.months);
    const items = await loadPlanCards(tx, access, {
      fromDate: range.fromDate,
      toDate: range.toDate,
      companyId: query.companyId,
      projectId: query.projectId,
      brandId: query.brandId,
      status: query.status,
    });
    return { items };
  }, { readOnly: true });
}

interface PlanFieldRow {
  companyId: string;
  projectId: string;
  brandId: string | null;
  title: string;
  amount: number;
  plannedDate: string;
  datePrecision: DatePrecision;
  vendorName: string | null;
  description: string | null;
  status: string;
  version: number;
}

async function loadPlanFields(tx: PlanTx, planId: string): Promise<PlanFieldRow> {
  const row = rowsOf<{
    company_id: string;
    project_id: string;
    brand_id: string | null;
    title: string;
    amount: number;
    planned_date: string;
    date_precision: string;
    vendor_name: string | null;
    description: string | null;
    status: string;
    version: number;
  }>(
    await tx.execute(sql`SELECT p.company_id, p.project_id, p.brand_id, p.title, p.amount,
                                p.planned_date::text AS planned_date, p.date_precision,
                                p.vendor_name, p.description, p.status, p.version
        FROM expenseone.cost_plans p WHERE p.id = ${planId}::uuid`),
  )[0];
  if (!row) throw new PlanError("NOT_FOUND", "계획을 찾을 수 없습니다.");
  return {
    companyId: row.company_id,
    projectId: row.project_id,
    brandId: row.brand_id,
    title: row.title,
    amount: num(row.amount),
    plannedDate: row.planned_date,
    datePrecision: (row.date_precision === "MONTH" ? "MONTH" : "DAY") as DatePrecision,
    vendorName: row.vendor_name,
    description: row.description,
    status: row.status,
    version: num(row.version),
  };
}

export async function createPlan(actor: PlanActorInput, input: CreatePlanInput): Promise<{ id: string }> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    const project = await requireProjectAccess(tx, access, input.projectId);
    if (project.companyId !== input.companyId) {
      throw new PlanError("VALIDATION_ERROR", "프로젝트의 법인과 다릅니다.");
    }
    await assertPlannableCompany(tx, input.companyId);
    if (input.brandId) await assertBrandInCompany(tx, input.brandId, input.companyId);

    // MONTH 면 말일로 맞춰 저장한다. 안 맞추면 CHECK cost_plans_month_end 가 INSERT 를 거부한다(5절 5).
    const plannedDate = normalizePlannedDate(input.plannedDate, input.datePrecision);
    if (!plannedDate) throw new PlanError("VALIDATION_ERROR", "날짜가 올바르지 않습니다.");

    const [created] = await tx
      .insert(costPlans)
      .values({
        companyId: input.companyId,
        projectId: input.projectId,
        brandId: input.brandId,
        title: input.title,
        amount: input.amount,
        plannedDate,
        datePrecision: input.datePrecision,
        vendorName: input.vendorName,
        description: input.description,
        createdById: actor.id,
        updatedById: actor.id,
      })
      .returning({ id: costPlans.id });

    await logChange(tx, {
      companyId: input.companyId,
      projectId: input.projectId,
      planId: created.id,
      entityType: "plan",
      entityId: created.id,
      action: "CREATE",
      actorId: actor.id,
      after: {
        title: input.title,
        amount: input.amount,
        plannedDate,
        datePrecision: input.datePrecision,
        projectId: input.projectId,
        brandId: input.brandId,
        vendorName: input.vendorName,
      },
    });
    return { id: created.id };
  });
}

/**
 * 수정: 낙관적 잠금. (c) 로 행을 잠그고 version 이 같을 때만 쓴다. 0행이면 409(T15).
 * company_id·created_by_id 는 바꾸지 않는다. 사업 이동은 같은 법인 안에서만.
 */
export async function updatePlan(
  actor: PlanActorInput,
  planId: string,
  input: UpdatePlanInput,
): Promise<{ id: string; version: number }> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    await requirePlanAccess(tx, access, planId, { forUpdate: true });
    const current = await loadPlanFields(tx, planId);
    if (current.status !== "PLANNED") {
      throw new PlanError("CONFLICT", "취소되었거나 마감된 계획은 수정할 수 없습니다.");
    }
    if (current.version !== input.version) {
      throw new PlanError("CONFLICT", "다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도해주세요.");
    }

    const assignments: SQL[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};

    if (input.projectId !== undefined && input.projectId !== current.projectId) {
      const target = await requireProjectAccess(tx, access, input.projectId);
      if (target.companyId !== current.companyId) {
        throw new PlanError("VALIDATION_ERROR", "같은 법인의 프로젝트로만 옮길 수 있습니다.");
      }
      assignments.push(sql`project_id = ${input.projectId}::uuid`);
      before.projectId = current.projectId;
      after.projectId = input.projectId;
    }
    if (input.brandId !== undefined && input.brandId !== current.brandId) {
      if (input.brandId) await assertBrandInCompany(tx, input.brandId, current.companyId);
      assignments.push(sql`brand_id = ${input.brandId}::uuid`);
      before.brandId = current.brandId;
      after.brandId = input.brandId;
    }
    if (input.title !== undefined && input.title !== current.title) {
      assignments.push(sql`title = ${input.title}`);
      before.title = current.title;
      after.title = input.title;
    }
    if (input.amount !== undefined && input.amount !== current.amount) {
      assignments.push(sql`amount = ${input.amount}`);
      before.amount = current.amount;
      after.amount = input.amount;
    }
    if (input.vendorName !== undefined && input.vendorName !== current.vendorName) {
      assignments.push(sql`vendor_name = ${input.vendorName}`);
      before.vendorName = current.vendorName;
      after.vendorName = input.vendorName;
    }
    if (input.description !== undefined && input.description !== current.description) {
      assignments.push(sql`description = ${input.description}`);
      before.description = current.description;
      after.description = input.description;
    }
    if (input.plannedDate !== undefined || input.datePrecision !== undefined) {
      const precision = input.datePrecision ?? current.datePrecision;
      const normalized = normalizePlannedDate(input.plannedDate ?? current.plannedDate, precision);
      if (!normalized) throw new PlanError("VALIDATION_ERROR", "날짜가 올바르지 않습니다.");
      if (normalized !== current.plannedDate) {
        assignments.push(sql`planned_date = ${normalized}::date`);
        before.plannedDate = current.plannedDate;
        after.plannedDate = normalized;
      }
      if (precision !== current.datePrecision) {
        assignments.push(sql`date_precision = ${precision}`);
        before.datePrecision = current.datePrecision;
        after.datePrecision = precision;
      }
    }

    const version = await bumpPlanVersion(tx, planId, input.version, actor.id, assignments);
    await logChange(tx, {
      companyId: current.companyId,
      projectId: (after.projectId as string | undefined) ?? current.projectId,
      planId,
      entityType: "plan",
      entityId: planId,
      action: "UPDATE",
      actorId: actor.id,
      before,
      after: { ...after, version },
    });
    return { id: planId, version };
  });
}

/** 취소: 하드 삭제는 없다. status 만 CANCELLED 로 바꾸고 사유를 이력에 남긴다. */
export async function cancelPlan(
  actor: PlanActorInput,
  planId: string,
  input: CancelPlanInput,
): Promise<{ id: string; version: number }> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    await requirePlanAccess(tx, access, planId, { forUpdate: true });
    const current = await loadPlanFields(tx, planId);
    if (current.status === "CANCELLED") throw new PlanError("CONFLICT", "이미 취소된 계획입니다.");
    if (current.status !== "PLANNED") throw new PlanError("CONFLICT", "마감된 계획은 취소할 수 없습니다.");
    if (current.version !== input.version) {
      throw new PlanError("CONFLICT", "다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도해주세요.");
    }

    const version = await bumpPlanVersion(tx, planId, input.version, actor.id, [sql`status = 'CANCELLED'`]);
    await logChange(tx, {
      companyId: current.companyId,
      projectId: current.projectId,
      planId,
      entityType: "plan",
      entityId: planId,
      action: "UPDATE",
      actorId: actor.id,
      before: { status: current.status },
      after: { status: "CANCELLED", version },
      reason: input.reason,
    });
    return { id: planId, version };
  });
}

/** 5절 2 의 UPDATE 한 문장. 바꿀 칸이 없어도 version·updated_* 는 올린다. 0행 = 그 사이 누가 고쳤다 → 409. */
async function bumpPlanVersion(
  tx: PlanTx,
  planId: string,
  expectedVersion: number,
  actorId: string,
  assignments: SQL[],
): Promise<number> {
  const sets = sql.join(
    [
      ...assignments,
      sql`version = version + 1`,
      sql`updated_by_id = ${actorId}::uuid`,
      sql`updated_at = now()`,
    ],
    sql`, `,
  );
  const rows = rowsOf<{ version: number }>(
    await tx.execute(sql`UPDATE expenseone.cost_plans SET ${sets}
                          WHERE id = ${planId}::uuid AND version = ${expectedVersion}
                      RETURNING version`),
  );
  const row = rows[0];
  if (!row) {
    throw new PlanError("CONFLICT", "다른 사람이 먼저 수정했습니다. 새로고침 후 다시 시도해주세요.");
  }
  return num(row.version);
}

// --- 계획 상세 -------------------------------------------------------------------

export interface PlanLinkRow extends LinkForDiff {
  snapshotTitle: string;
  snapshotDueDate: string | null;
  snapshotSubmittedAt: string;
  createdAt: string;
  /** 요청이 삭제됨 → "삭제된 요청" */
  deleted: boolean;
  /** 연결 뒤 요청 금액이 바뀜 → "제출 후 수정됨" */
  modifiedAfterLink: boolean;
  amountDrift: number | null;
}

export interface PlanCommentRow {
  id: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  /** 이 요청자가 고치거나 지울 수 있는가(작성자 본인 + 삭제되지 않음). */
  canEdit: boolean;
}

export interface PlanChangeRow {
  id: string;
  entityType: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  reason: string | null;
  createdAt: string;
  before: unknown;
  after: unknown;
}

export interface PlanDetail {
  plan: {
    id: string;
    companyId: string;
    companyName: string;
    companySlug: string;
    projectId: string;
    projectName: string;
    brandId: string | null;
    brandName: string | null;
    title: string;
    amount: number;
    plannedDate: string;
    datePrecision: DatePrecision;
    plannedDateLabel: string;
    vendorName: string | null;
    description: string | null;
    status: string;
    version: number;
    ownerId: string | null;
    ownerName: string | null;
    updatedByName: string | null;
    createdAt: string;
    updatedAt: string;
  };
  summary: { requestedSum: number; linkCount: number; diff: number };
  links: PlanLinkRow[];
  comments: PlanCommentRow[];
  changeLog: PlanChangeRow[];
  canEdit: boolean;
  isExecutive: boolean;
}

const iso = (v: Date | string | null): string | null => (v == null ? null : new Date(v).toISOString());

async function loadLinks(tx: PlanTx, planId: string, planAmount: number) {
  const rows = rowsOf<{
    id: string;
    expense_id: string | null;
    snapshot_amount: number;
    snapshot_title: string;
    snapshot_due_date: string | null;
    snapshot_submitted_at: Date;
    created_at: Date;
    current_status: string | null;
    current_amount: number | null;
  }>(
    await tx.execute(sql`SELECT x.id, x.expense_id, x.snapshot_amount, x.snapshot_title,
                                x.snapshot_due_date::text AS snapshot_due_date,
                                x.snapshot_submitted_at, x.created_at,
                                e.status::text AS current_status, e.amount AS current_amount
        FROM expenseone.plan_expense_links x
        LEFT JOIN expenseone.expenses e ON e.id = x.expense_id
       WHERE x.plan_id = ${planId}::uuid AND x.unlinked_at IS NULL
       ORDER BY x.created_at`),
  );
  const base = rows.map((r) => ({
    id: r.id,
    expenseId: r.expense_id,
    snapshotAmount: num(r.snapshot_amount),
    currentAmount: r.current_amount == null ? null : num(r.current_amount),
    currentStatus: r.current_status,
    snapshotTitle: r.snapshot_title,
    snapshotDueDate: r.snapshot_due_date,
    snapshotSubmittedAt: iso(r.snapshot_submitted_at) ?? "",
    createdAt: iso(r.created_at) ?? "",
  }));
  // 차이는 항상 순수 함수로 — 계획 금액 − 활성 스냅샷 합계. 요청이 나중에 바뀌어도 합계는 그대로(결정 1-2).
  const diff = computeLinkDiff(planAmount, base);
  const links: PlanLinkRow[] = diff.links.map((row) => ({
    ...row.link,
    deleted: row.deleted,
    modifiedAfterLink: row.modifiedAfterLink,
    amountDrift: row.amountDrift,
  }));
  return {
    links,
    summary: { requestedSum: diff.requestedSum, linkCount: diff.linkCount, diff: diff.diff },
  };
}

async function loadComments(tx: PlanTx, planId: string, userId: string): Promise<PlanCommentRow[]> {
  const rows = rowsOf<{
    id: string;
    author_id: string | null;
    author_name: string | null;
    body: string;
    created_at: Date;
    edited_at: Date | null;
    deleted_at: Date | null;
  }>(
    await tx.execute(sql`SELECT c.id, c.author_id, u.name AS author_name, c.body,
                                c.created_at, c.edited_at, c.deleted_at
        FROM expenseone.plan_comments c
        LEFT JOIN expenseone.users u ON u.id = c.author_id
       WHERE c.plan_id = ${planId}::uuid
       ORDER BY c.created_at, c.id`),
  );
  return rows.map((r) => ({
    id: r.id,
    authorId: r.author_id,
    authorName: r.author_name,
    body: r.body,
    createdAt: iso(r.created_at) ?? "",
    editedAt: iso(r.edited_at),
    deletedAt: iso(r.deleted_at),
    canEdit: canEditComment({ authorId: r.author_id, deletedAt: r.deleted_at }, userId),
  }));
}

export async function getPlanDetail(actor: PlanActorInput, planId: string): Promise<PlanDetail> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    await requirePlanAccess(tx, access, planId);

    const row = rowsOf<{
      id: string;
      company_id: string;
      company_name: string;
      company_slug: string;
      project_id: string;
      project_name: string;
      brand_id: string | null;
      brand_name: string | null;
      title: string;
      amount: number;
      planned_date: string;
      date_precision: string;
      vendor_name: string | null;
      description: string | null;
      status: string;
      version: number;
      created_by_id: string | null;
      owner_name: string | null;
      updated_by_name: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      await tx.execute(sql`SELECT p.id, p.company_id, c.name AS company_name, c.slug AS company_slug,
                                  p.project_id, j.name AS project_name, p.brand_id, b.name AS brand_name,
                                  p.title, p.amount, p.planned_date::text AS planned_date, p.date_precision,
                                  p.vendor_name, p.description, p.status, p.version,
                                  p.created_by_id, u.name AS owner_name, w.name AS updated_by_name,
                                  p.created_at, p.updated_at
          FROM expenseone.cost_plans p
          JOIN expenseone.companies c ON c.id = p.company_id
          JOIN expenseone.plan_projects j ON j.id = p.project_id
          LEFT JOIN expenseone.plan_brands b ON b.id = p.brand_id
          LEFT JOIN expenseone.users u ON u.id = p.created_by_id
          LEFT JOIN expenseone.users w ON w.id = p.updated_by_id
         WHERE p.id = ${planId}::uuid`),
    )[0];
    if (!row) throw new PlanError("NOT_FOUND", "계획을 찾을 수 없습니다.");

    const precision = (row.date_precision === "MONTH" ? "MONTH" : "DAY") as DatePrecision;
    const amount = num(row.amount);
    const { links, summary } = await loadLinks(tx, planId, amount);
    const comments = await loadComments(tx, planId, access.userId);

    const historyRows = rowsOf<{
      id: string;
      entity_type: string;
      action: string;
      actor_id: string | null;
      actor_name: string | null;
      reason: string | null;
      created_at: Date;
      before_data: unknown;
      after_data: unknown;
    }>(
      await tx.execute(sql`SELECT g.id, g.entity_type, g.action, g.actor_id, a.name AS actor_name,
                                  g.reason, g.created_at, g.before_data, g.after_data
          FROM expenseone.plan_change_log g
          LEFT JOIN expenseone.users a ON a.id = g.actor_id
         WHERE g.plan_id = ${planId}::uuid
         ORDER BY g.created_at DESC, g.id DESC
         LIMIT 10`),
    );

    return {
      plan: {
        id: row.id,
        companyId: row.company_id,
        companyName: row.company_name,
        companySlug: row.company_slug,
        projectId: row.project_id,
        projectName: row.project_name,
        brandId: row.brand_id,
        brandName: row.brand_name,
        title: row.title,
        amount,
        plannedDate: row.planned_date,
        datePrecision: precision,
        plannedDateLabel: plannedDateLabel(row.planned_date, precision),
        vendorName: row.vendor_name,
        description: row.description,
        status: row.status,
        version: num(row.version),
        ownerId: row.created_by_id,
        ownerName: row.owner_name,
        updatedByName: row.updated_by_name,
        createdAt: iso(row.created_at) ?? "",
        updatedAt: iso(row.updated_at) ?? "",
      },
      summary,
      links,
      comments,
      changeLog: historyRows.map((g) => ({
        id: g.id,
        entityType: g.entity_type,
        action: g.action,
        actorId: g.actor_id,
        actorName: g.actor_name,
        reason: g.reason,
        createdAt: iso(g.created_at) ?? "",
        before: g.before_data,
        after: g.after_data,
      })),
      // 접근할 수 있으면 곧 수정할 수 있다(등급 없음). 취소·마감된 계획만 잠근다.
      canEdit: row.status === "PLANNED",
      isExecutive: access.isExecutive,
    };
  }, { readOnly: true });
}

// --- 메모 ------------------------------------------------------------------------

export async function listComments(actor: PlanActorInput, planId: string): Promise<PlanCommentRow[]> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    await requirePlanAccess(tx, access, planId);
    return loadComments(tx, planId, access.userId);
  }, { readOnly: true });
}

export async function createComment(
  actor: PlanActorInput,
  planId: string,
  input: CommentBodyInput,
): Promise<PlanCommentRow[]> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    const plan = await requirePlanAccess(tx, access, planId);

    const [created] = await tx
      .insert(planComments)
      .values({ planId, companyId: plan.companyId, authorId: actor.id, body: input.body })
      .returning({ id: planComments.id });

    await logChange(tx, {
      companyId: plan.companyId,
      projectId: plan.projectId,
      planId,
      entityType: "comment",
      entityId: created.id,
      action: "CREATE",
      actorId: actor.id,
      after: { length: input.body.length },
    });
    return loadComments(tx, planId, access.userId);
  });
}

/** 본인 메모만. 원문은 이력의 before_data 에 남는다(5절 6). */
export async function updateComment(
  actor: PlanActorInput,
  planId: string,
  commentId: string,
  input: CommentBodyInput,
): Promise<PlanCommentRow[]> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    const plan = await requirePlanAccess(tx, access, planId);
    const current = await requireOwnComment(tx, planId, commentId, actor.id);

    await tx.execute(sql`UPDATE expenseone.plan_comments
                            SET body = ${input.body}, edited_at = now()
                          WHERE id = ${commentId}::uuid`);
    await logChange(tx, {
      companyId: plan.companyId,
      projectId: plan.projectId,
      planId,
      entityType: "comment",
      entityId: commentId,
      action: "UPDATE",
      actorId: actor.id,
      before: { body: current.body },
      after: { body: input.body },
    });
    return loadComments(tx, planId, access.userId);
  });
}

/** 삭제 = deleted_at + deleted_by_id + body ''(5절 6). 행은 남는다. */
export async function deleteComment(
  actor: PlanActorInput,
  planId: string,
  commentId: string,
): Promise<PlanCommentRow[]> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    const plan = await requirePlanAccess(tx, access, planId);
    const current = await requireOwnComment(tx, planId, commentId, actor.id);

    await tx.execute(sql`UPDATE expenseone.plan_comments
                            SET body = '', deleted_at = now(), deleted_by_id = ${actor.id}::uuid
                          WHERE id = ${commentId}::uuid`);
    await logChange(tx, {
      companyId: plan.companyId,
      projectId: plan.projectId,
      planId,
      entityType: "comment",
      entityId: commentId,
      action: "DELETE",
      actorId: actor.id,
      before: { body: current.body },
    });
    return loadComments(tx, planId, access.userId);
  });
}

async function requireOwnComment(
  tx: PlanTx,
  planId: string,
  commentId: string,
  userId: string,
): Promise<{ body: string }> {
  const row = rowsOf<{ author_id: string | null; body: string; deleted_at: Date | null }>(
    await tx.execute(sql`SELECT c.author_id, c.body, c.deleted_at
        FROM expenseone.plan_comments c
       WHERE c.id = ${commentId}::uuid AND c.plan_id = ${planId}::uuid
         FOR UPDATE`),
  )[0];
  if (!row) throw new PlanError("NOT_FOUND", "메모를 찾을 수 없습니다.");
  if (!canEditComment({ authorId: row.author_id, deletedAt: row.deleted_at }, userId)) {
    throw new PlanError("FORBIDDEN", "본인이 쓴 메모만 수정하거나 지울 수 있습니다.");
  }
  return { body: row.body };
}

/** 스레드를 열 때 읽음 위치를 올린다. 이력에는 남기지 않는다(감사 대상이 아니다). */
export async function markCommentsRead(actor: PlanActorInput, planId: string): Promise<{ readAt: string }> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    await requirePlanAccess(tx, access, planId);
    const [row] = await tx
      .insert(planCommentReads)
      .values({ planId, userId: actor.id })
      .onConflictDoUpdate({
        target: [planCommentReads.planId, planCommentReads.userId],
        set: { lastReadAt: sql`now()` },
      })
      .returning({ lastReadAt: planCommentReads.lastReadAt });
    return { readAt: iso(row.lastReadAt) ?? "" };
  });
}

// --- 입금요청 연결 ----------------------------------------------------------------

export interface LinkCandidate {
  id: string;
  title: string;
  amount: number;
  dueDate: string | null;
  status: string;
  submitterName: string | null;
  createdAt: string;
}

/**
 * (f) 연결 후보. 같은 법인의 KRW 입금요청 중 반려·취소가 아니고 **아직 연결되지 않은** 것만.
 * MEMBER 는 본인이 제출한 요청만 본다 — 이건 권한 근거가 아니라 **연결 범위**다(5절 7).
 */
export async function listLinkCandidates(
  actor: PlanActorInput,
  planId: string,
  q?: string,
): Promise<LinkCandidate[]> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    const plan = await requirePlanAccess(tx, access, planId);
    const canLinkAll = canLinkAllCompanyRequests(access);
    const search = q ? sql` AND e.title ILIKE ${`%${q}%`}` : sql``;

    const rows = rowsOf<{
      id: string;
      title: string;
      amount: number;
      due_date: string | null;
      status: string;
      submitter_name: string | null;
      created_at: Date;
    }>(
      await tx.execute(sql`SELECT e.id, e.title, e.amount, e.due_date::text AS due_date,
                                  e.status::text AS status, u.name AS submitter_name, e.created_at
          FROM expenseone.expenses e
          LEFT JOIN expenseone.users u ON u.id = e.submitted_by_id
         WHERE e.type = 'DEPOSIT_REQUEST' AND e.status NOT IN ('REJECTED', 'CANCELLED')
           AND e.currency = 'KRW' AND e.company_id = ${plan.companyId}::uuid
           AND (${canLinkAll}::boolean OR e.submitted_by_id = ${access.userId}::uuid)
           AND NOT EXISTS (SELECT 1 FROM expenseone.plan_expense_links x
                            WHERE x.expense_id = e.id AND x.unlinked_at IS NULL)${search}
         ORDER BY e.created_at DESC
         LIMIT 50`),
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      amount: num(r.amount),
      dueDate: r.due_date,
      status: r.status,
      submitterName: r.submitter_name,
      createdAt: iso(r.created_at) ?? "",
    }));
  }, { readOnly: true });
}

/**
 * (g) 연결 만들기 — 한 문장. 스냅샷 값은 **이 SELECT 에서만** 온다(클라이언트가 보내는 건 expense_id 뿐).
 * 0행 = 그 법인 요청이 아니거나 자격이 없다 → 404. 이미 연결됨 = 부분 UNIQUE 위반 → 409.
 */
export async function linkExpense(
  actor: PlanActorInput,
  planId: string,
  expenseId: string,
): Promise<{ linkId: string }> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    const plan = await requirePlanAccess(tx, access, planId);
    if (plan.status !== "PLANNED") {
      throw new PlanError("CONFLICT", "취소되었거나 마감된 계획에는 연결할 수 없습니다.");
    }
    const canLinkAll = canLinkAllCompanyRequests(access);

    let rows: Array<{ id: string; snapshot_amount: number; snapshot_title: string }>;
    try {
      rows = rowsOf<{ id: string; snapshot_amount: number; snapshot_title: string }>(
        await tx.execute(sql`INSERT INTO expenseone.plan_expense_links
            (plan_id, company_id, expense_id, snapshot_amount, snapshot_currency, snapshot_amount_original,
             snapshot_title, snapshot_due_date, snapshot_company_id, snapshot_submitted_at, linked_by_id)
          SELECT p.id, p.company_id, e.id, e.amount, e.currency, e.amount_original,
                 e.title, e.due_date, e.company_id, e.created_at, ${actor.id}::uuid
            FROM expenseone.cost_plans p
            JOIN expenseone.expenses e ON e.company_id = p.company_id
           WHERE p.id = ${planId}::uuid AND e.id = ${expenseId}::uuid
             AND e.type = 'DEPOSIT_REQUEST' AND e.status NOT IN ('REJECTED', 'CANCELLED')
             AND e.currency = 'KRW'
             AND (${canLinkAll}::boolean OR e.submitted_by_id = ${access.userId}::uuid)
          RETURNING id, snapshot_amount, snapshot_title`),
      );
    } catch (err) {
      throw asConflict(err, "이미 다른 계획에 연결된 입금요청입니다.");
    }
    const created = rows[0];
    if (!created) throw new PlanError("NOT_FOUND", "연결할 수 있는 입금요청이 아닙니다.");

    await logChange(tx, {
      companyId: plan.companyId,
      projectId: plan.projectId,
      planId,
      entityType: "link",
      entityId: created.id,
      action: "LINK",
      actorId: actor.id,
      after: {
        expenseId,
        snapshotAmount: num(created.snapshot_amount),
        snapshotTitle: created.snapshot_title,
      },
    });
    return { linkId: created.id };
  });
}

/** 해제는 소프트(unlinked_at + unlinked_by_id). 스냅샷 행은 남는다. */
export async function unlinkExpense(
  actor: PlanActorInput,
  planId: string,
  linkId: string,
): Promise<{ linkId: string }> {
  return withPlanTx(async (tx) => {
    const access = await loadAccess(tx, actorAccess(actor));
    const plan = await requirePlanAccess(tx, access, planId);

    const row = rowsOf<{ id: string; expense_id: string | null; snapshot_amount: number }>(
      await tx.execute(sql`UPDATE expenseone.plan_expense_links x
                              SET unlinked_at = now(), unlinked_by_id = ${actor.id}::uuid
                            WHERE x.id = ${linkId}::uuid AND x.plan_id = ${planId}::uuid
                              AND x.unlinked_at IS NULL
                        RETURNING x.id, x.expense_id, x.snapshot_amount`),
    )[0];
    if (!row) throw new PlanError("NOT_FOUND", "연결을 찾을 수 없습니다.");

    await logChange(tx, {
      companyId: plan.companyId,
      projectId: plan.projectId,
      planId,
      entityType: "link",
      entityId: row.id,
      action: "UNLINK",
      actorId: actor.id,
      before: { expenseId: row.expense_id, snapshotAmount: num(row.snapshot_amount) },
    });
    return { linkId: row.id };
  });
}
