// ---------------------------------------------------------------------------
// 비용계획 테이블 — Drizzle 선언 (drizzle/0020_app_flags.sql·0021_cost_planning.sql 과 1:1)
//
// 원본은 projection/rollout/s2/final/schema.drizzle.ts. 별도 모듈로 두는 이유(P6·C6):
// schema.ts 는 전 서비스가 import 하므로 계획 표를 거기 붙이면 핫 경로 번들·타입이 같이 움직인다.
// 이 모듈은 계획 서비스(src/services/plan.service.ts)와 계획 전용 클라이언트만 import 한다.
//
// 원본은 SQL 파일이다. drizzle-kit generate 는 타입 확인용 diff 만 만들고 그 SQL 은 쓰지 않는다(drizzle/README.md).
// 규칙: 새 표 어디에도 relations() 를 붙이지 않는다(C6, 첫 출시 제외). users.role·company_id 는 권한 근거가 아니다.
// 권한 근거는 plan_project_members 행뿐(대표 제외) — created_by_id 는 표시용이다(SCHEMA.md 3절, V-SECURITY-1).
// ---------------------------------------------------------------------------
import {
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  date,
  char,
  jsonb,
  index,
  uniqueIndex,
  check,
  foreignKey,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { expenseSchema, users, companies, expenses } from "./schema";

/**
 * app_flags -- 기능 스위치 (0020). 서버(Drizzle=postgres)만 읽는다. 브라우저 권한 0.
 * cost_planning 행: enabled AND (allowUserIds 가 비었거나 나를 포함) 일 때만 진입. 읽기 실패·행 없음 = OFF(P1).
 */
export const appFlags = expenseSchema.table("app_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  allowUserIds: uuid("allow_user_ids").array().notNull().default(sql`'{}'::uuid[]`),
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppFlag = typeof appFlags.$inferSelect;

/**
 * plan_executives -- "대표" 허용 목록 (전체 법인 조회·브랜드 등록·ERP 대조). users.role 과 분리.
 * 유효 = revokedAt IS NULL. user 삭제 시 CASCADE.
 */
export const planExecutives = expenseSchema.table(
  "plan_executives",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedById: uuid("granted_by_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedById: uuid("revoked_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    check("plan_executives_revoke_pair", sql`${t.revokedById} IS NULL OR ${t.revokedAt} IS NOT NULL`),
    check("plan_executives_note_len", sql`${t.note} IS NULL OR length(${t.note}) <= 500`),
  ],
);

/**
 * plan_brands -- 법인별 브랜드. categoryCode = 기존 입금요청 카테고리 값(연결 규칙). 초기값 9행.
 */
export const planBrands = expenseSchema.table(
  "plan_brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: varchar("name", { length: 100 }).notNull(),
    categoryCode: varchar("category_code", { length: 100 }),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("plan_brands_id_company_key").on(t.id, t.companyId),
    uniqueIndex("idx_plan_brands_company_name").on(t.companyId, sql`lower(btrim(${t.name}))`),
    uniqueIndex("idx_plan_brands_company_category")
      .on(t.companyId, t.categoryCode)
      .where(sql`category_code IS NOT NULL`),
    check("plan_brands_name_len", sql`length(btrim(${t.name})) BETWEEN 1 AND 100`),
    check(
      "plan_brands_category_code_len",
      sql`${t.categoryCode} IS NULL OR length(btrim(${t.categoryCode})) BETWEEN 1 AND 100`,
    ),
  ],
);

/**
 * plan_projects -- 사업(프로젝트). 법인 1개 소속, 참여자를 붙이는 단위. 삭제는 deletedAt(소프트).
 * createdById 는 표시용(만든 사람) — 권한 근거가 아니다. 권한은 planProjectMembers 행뿐(대표 제외, V-SECURITY-1).
 * 서버는 사업 생성 트랜잭션에서 만든 사람을 참여자로 INSERT 한다. NULL = 사용자 물리 삭제 뒤.
 */
export const planProjects = expenseSchema.table(
  "plan_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    isActive: boolean("is_active").notNull().default(true),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedById: uuid("deleted_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("plan_projects_id_company_key").on(t.id, t.companyId),
    uniqueIndex("idx_plan_projects_company_name")
      .on(t.companyId, sql`lower(btrim(${t.name}))`)
      .where(sql`deleted_at IS NULL`),
    index("idx_plan_projects_created_by").on(t.createdById).where(sql`created_by_id IS NOT NULL`),
    check("plan_projects_name_len", sql`length(btrim(${t.name})) BETWEEN 1 AND 100`),
    check("plan_projects_description_len", sql`${t.description} IS NULL OR length(${t.description}) <= 2000`),
    check("plan_projects_soft_delete_pair", sql`${t.deletedById} IS NULL OR ${t.deletedAt} IS NOT NULL`),
  ],
);

/**
 * plan_project_members -- 참여자. 행 존재 = 그 사업의 모든 항목 수정 가능(등급 없음). user 삭제 시 CASCADE.
 */
export const planProjectMembers = expenseSchema.table(
  "plan_project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => planProjects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addedById: uuid("added_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    index("idx_plan_project_members_user").on(t.userId),
  ],
);

/**
 * cost_plans -- 계획 항목. 담당자 = createdById(처음 추가한 사람, 바꾸지 않음). KRW·일회성.
 * 법인 경계는 복합 FK: (projectId, companyId)→plan_projects, (brandId, companyId)→plan_brands.
 * datePrecision 이 월 단위면 plannedDate 는 구간 끝날 — MONTH_EARLY 10일 · MONTH_MID 20일 · MONTH 말일(CHECK, 0024). version = 낙관적 잠금(WHERE version = expected, 0행 → 409).
 * erpAppliedAt/ById = 대표가 수동으로 단 "ERP 반영함" 표시(0023). 장부 표시라 version 을 올리지 않는다.
 */
export const costPlans = expenseSchema.table(
  "cost_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    projectId: uuid("project_id").notNull(),
    brandId: uuid("brand_id"),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    vendorName: varchar("vendor_name", { length: 200 }),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("KRW"),
    plannedDate: date("planned_date", { mode: "string" }).notNull(),
    datePrecision: text("date_precision").notNull().default("DAY"),
    status: text("status").notNull().default("PLANNED"),
    version: integer("version").notNull().default(1),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    updatedById: uuid("updated_by_id").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedById: uuid("deleted_by_id").references(() => users.id, { onDelete: "set null" }),
    erpAppliedAt: timestamp("erp_applied_at", { withTimezone: true }),
    erpAppliedById: uuid("erp_applied_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cost_plans_id_company_key").on(t.id, t.companyId),
    foreignKey({
      name: "cost_plans_project_same_company",
      columns: [t.projectId, t.companyId],
      foreignColumns: [planProjects.id, planProjects.companyId],
    }),
    foreignKey({
      name: "cost_plans_brand_same_company",
      columns: [t.brandId, t.companyId],
      foreignColumns: [planBrands.id, planBrands.companyId],
    }),
    index("idx_cost_plans_company_date").on(t.companyId, t.plannedDate).where(sql`deleted_at IS NULL`),
    index("idx_cost_plans_project_date").on(t.projectId, t.plannedDate).where(sql`deleted_at IS NULL`),
    index("idx_cost_plans_brand_date")
      .on(t.brandId, t.plannedDate)
      .where(sql`brand_id IS NOT NULL AND deleted_at IS NULL`),
    index("idx_cost_plans_created_by").on(t.createdById).where(sql`created_by_id IS NOT NULL`),
    check("cost_plans_amount_positive", sql`${t.amount} > 0`),
    check("cost_plans_currency_krw", sql`${t.currency} = 'KRW'`),
    check("cost_plans_title_len", sql`length(btrim(${t.title})) BETWEEN 1 AND 200`),
    check("cost_plans_description_len", sql`${t.description} IS NULL OR length(${t.description}) <= 4000`),
    check("cost_plans_vendor_len", sql`${t.vendorName} IS NULL OR length(btrim(${t.vendorName})) BETWEEN 1 AND 200`),
    check("cost_plans_date_precision", sql`${t.datePrecision} IN ('DAY', 'MONTH_EARLY', 'MONTH_MID', 'MONTH')`),
    check(
      "cost_plans_month_end",
      sql`${t.datePrecision} = 'DAY'
        OR (${t.datePrecision} = 'MONTH_EARLY' AND extract(day FROM ${t.plannedDate}) = 10)
        OR (${t.datePrecision} = 'MONTH_MID' AND extract(day FROM ${t.plannedDate}) = 20)
        OR (${t.datePrecision} = 'MONTH' AND ${t.plannedDate} = (date_trunc('month', ${t.plannedDate}::timestamp) + interval '1 month' - interval '1 day')::date)`,
    ),
    check("cost_plans_status", sql`${t.status} IN ('PLANNED', 'CANCELLED', 'CLOSED')`),
    check("cost_plans_version_positive", sql`${t.version} >= 1`),
    check("cost_plans_soft_delete_pair", sql`${t.deletedById} IS NULL OR ${t.deletedAt} IS NOT NULL`),
    check("cost_plans_erp_applied_pair", sql`${t.erpAppliedById} IS NULL OR ${t.erpAppliedAt} IS NOT NULL`),
  ],
);

/**
 * plan_expense_links -- 계획 ↔ 입금요청. 요청 여러 건, 연결 시점 스냅샷 고정(결정 1-2).
 * expenseId ON DELETE SET NULL (비용은 물리 삭제, I32). NULL = 요청이 삭제됨, 스냅샷은 남는다.
 * 활성 연결은 요청당 1개(부분 UNIQUE). 해제는 unlinkedAt(소프트).
 */
export const planExpenseLinks = expenseSchema.table(
  "plan_expense_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id").notNull(),
    companyId: uuid("company_id").notNull(),
    expenseId: uuid("expense_id").references(() => expenses.id, { onDelete: "set null" }),
    snapshotAmount: integer("snapshot_amount").notNull(),
    snapshotCurrency: varchar("snapshot_currency", { length: 3 }).notNull(),
    snapshotAmountOriginal: integer("snapshot_amount_original"),
    snapshotTitle: varchar("snapshot_title", { length: 200 }).notNull(),
    snapshotDueDate: date("snapshot_due_date", { mode: "string" }),
    snapshotCompanyId: uuid("snapshot_company_id").notNull(),
    snapshotSubmittedAt: timestamp("snapshot_submitted_at", { withTimezone: true }).notNull(),
    linkedById: uuid("linked_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    unlinkedAt: timestamp("unlinked_at", { withTimezone: true }),
    unlinkedById: uuid("unlinked_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    foreignKey({
      name: "plan_expense_links_plan_same_company",
      columns: [t.planId, t.companyId],
      foreignColumns: [costPlans.id, costPlans.companyId],
    }),
    uniqueIndex("idx_plan_expense_links_active_expense")
      .on(t.expenseId)
      .where(sql`expense_id IS NOT NULL AND unlinked_at IS NULL`),
    index("idx_plan_expense_links_plan").on(t.planId).where(sql`unlinked_at IS NULL`),
    index("idx_plan_expense_links_expense").on(t.expenseId).where(sql`expense_id IS NOT NULL`),
    check("plan_expense_links_snapshot_amount_positive", sql`${t.snapshotAmount} > 0`),
    check("plan_expense_links_snapshot_currency_krw", sql`${t.snapshotCurrency} = 'KRW'`),
    check("plan_expense_links_same_company", sql`${t.snapshotCompanyId} = ${t.companyId}`),
    check("plan_expense_links_unlink_pair", sql`${t.unlinkedById} IS NULL OR ${t.unlinkedAt} IS NOT NULL`),
  ],
);

/**
 * plan_comments -- 항목별 메모 스레드. 본인 것만 수정·삭제(서버 검사). 삭제 = deletedAt + body ''.
 * authorId NULL = 사용자 물리 삭제 뒤(아무도 수정 못 함).
 */
export const planComments = expenseSchema.table(
  "plan_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id").notNull(),
    companyId: uuid("company_id").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedById: uuid("deleted_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    foreignKey({
      name: "plan_comments_plan_same_company",
      columns: [t.planId, t.companyId],
      foreignColumns: [costPlans.id, costPlans.companyId],
    }),
    index("idx_plan_comments_plan_created").on(t.planId, t.createdAt),
    index("idx_plan_comments_author").on(t.authorId).where(sql`author_id IS NOT NULL`),
    check(
      "plan_comments_body_len",
      sql`length(${t.body}) <= 4000 AND (${t.deletedAt} IS NOT NULL OR length(btrim(${t.body})) >= 1)`,
    ),
    check("plan_comments_soft_delete_pair", sql`${t.deletedById} IS NULL OR ${t.deletedAt} IS NOT NULL`),
  ],
);

/**
 * plan_comment_reads -- 사용자별 메모 읽음 위치. 스레드를 열 때 UPSERT.
 */
export const planCommentReads = expenseSchema.table(
  "plan_comment_reads",
  {
    planId: uuid("plan_id")
      .notNull()
      .references(() => costPlans.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.planId, t.userId] }),
    index("idx_plan_comment_reads_user").on(t.userId),
  ],
);

/**
 * plan_evidence -- 증빙 메타. 파일은 비공개 버킷 plan-evidence(정책 없음, 서명 URL 만).
 * objectPath = `${companyId}/${planId}/${id}${fileExt}` 를 CHECK 가 강제하므로 서버는 id 를 randomUUID() 로
 * **먼저 만들고** objectPath 를 계산해 INSERT 한다(DEFAULT 에 의존하면 INSERT 실패).
 */
export const planEvidence = expenseSchema.table(
  "plan_evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id").notNull(),
    companyId: uuid("company_id").notNull(),
    bucketId: text("bucket_id").notNull().default("plan-evidence"),
    objectPath: text("object_path").notNull(),
    fileExt: text("file_ext").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    sha256: char("sha256", { length: 64 }),
    documentType: text("document_type").notNull().default("OTHER"),
    uploadStatus: text("upload_status").notNull().default("PENDING"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedById: uuid("deleted_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    foreignKey({
      name: "plan_evidence_plan_same_company",
      columns: [t.planId, t.companyId],
      foreignColumns: [costPlans.id, costPlans.companyId],
    }),
    uniqueIndex("idx_plan_evidence_object_path").on(t.objectPath),
    index("idx_plan_evidence_plan").on(t.planId).where(sql`deleted_at IS NULL`),
    index("idx_plan_evidence_pending").on(t.createdAt).where(sql`upload_status = 'PENDING'`),
    check("plan_evidence_bucket", sql`${t.bucketId} = 'plan-evidence'`),
    check(
      "plan_evidence_file_ext",
      sql`${t.fileExt} IN ('.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.pdf')`,
    ),
    check(
      "plan_evidence_path_scoped",
      sql`${t.objectPath} = ${t.companyId}::text || '/' || ${t.planId}::text || '/' || ${t.id}::text || ${t.fileExt}`,
    ),
    check("plan_evidence_file_name_len", sql`length(btrim(${t.fileName})) BETWEEN 1 AND 255`),
    check("plan_evidence_file_size", sql`${t.fileSize} > 0 AND ${t.fileSize} <= 10485760`),
    check(
      "plan_evidence_mime",
      sql`${t.mimeType} IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf')`,
    ),
    check("plan_evidence_sha256_hex", sql`${t.sha256} IS NULL OR ${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "plan_evidence_document_type",
      sql`${t.documentType} IN ('ESTIMATE', 'INVOICE', 'CONTRACT', 'RECEIPT', 'OTHER')`,
    ),
    check("plan_evidence_upload_status", sql`${t.uploadStatus} IN ('PENDING', 'UPLOADED', 'FAILED')`),
    check("plan_evidence_uploaded_pair", sql`(${t.uploadStatus} = 'UPLOADED') = (${t.uploadedAt} IS NOT NULL)`),
    check("plan_evidence_soft_delete_pair", sql`${t.deletedById} IS NULL OR ${t.deletedAt} IS NOT NULL`),
  ],
);

/**
 * plan_change_log -- 변경 이력(추가만). 변경과 같은 트랜잭션에서 INSERT.
 * 계획 코드에서 db.update(planChangeLog)·db.delete(planChangeLog) 는 0건이어야 한다(CI grep).
 * projectId·planId 는 companyId 와 복합 FK(V-SECURITY-3) — 이력의 법인이 사업·계획과 항상 같다. NULL 참조는 검사 생략(MATCH SIMPLE).
 * companyId 는 executive 이벤트(참조 없음)에서만 NULL. actorId NULL = 사용자 물리 삭제 뒤.
 */
export const planChangeLog = expenseSchema.table(
  "plan_change_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => companies.id),
    projectId: uuid("project_id"),
    planId: uuid("plan_id"),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    beforeData: jsonb("before_data"),
    afterData: jsonb("after_data"),
    reason: text("reason"),
    requestId: varchar("request_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "plan_change_log_project_same_company",
      columns: [t.projectId, t.companyId],
      foreignColumns: [planProjects.id, planProjects.companyId],
    }),
    foreignKey({
      name: "plan_change_log_plan_same_company",
      columns: [t.planId, t.companyId],
      foreignColumns: [costPlans.id, costPlans.companyId],
    }),
    index("idx_plan_change_log_plan").on(t.planId, t.createdAt).where(sql`plan_id IS NOT NULL`),
    index("idx_plan_change_log_project").on(t.projectId, t.createdAt).where(sql`project_id IS NOT NULL`),
    index("idx_plan_change_log_actor").on(t.actorId, t.createdAt).where(sql`actor_id IS NOT NULL`),
    check(
      "plan_change_log_entity_type",
      sql`${t.entityType} IN ('project', 'member', 'plan', 'link', 'comment', 'evidence', 'brand', 'executive')`,
    ),
    check(
      "plan_change_log_action",
      sql`${t.action} IN ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'LINK', 'UNLINK', 'ADD', 'REMOVE', 'GRANT', 'REVOKE')`,
    ),
    check(
      "plan_change_log_scope",
      sql`${t.companyId} IS NOT NULL OR (${t.entityType} = 'executive' AND ${t.projectId} IS NULL AND ${t.planId} IS NULL)`,
    ),
    check("plan_change_log_reason_len", sql`${t.reason} IS NULL OR length(${t.reason}) <= 1000`),
    check(
      "plan_change_log_json_objects",
      sql`(${t.beforeData} IS NULL OR jsonb_typeof(${t.beforeData}) = 'object') AND (${t.afterData} IS NULL OR jsonb_typeof(${t.afterData}) = 'object')`,
    ),
  ],
);

/**
 * plan_erp_outbox -- ERP 반영 대기함(P8·P9). 첫 출시엔 서버가 쓰기만, 소비자는 S5 의 ERP 소유 함수.
 * (planId, planVersion, eventType) UNIQUE. result = ERP 함수 회신(라인 id 등).
 */
export const planErpOutbox = expenseSchema.table(
  "plan_erp_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull(),
    planId: uuid("plan_id").notNull(),
    planVersion: integer("plan_version").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    result: jsonb("result"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "plan_erp_outbox_plan_same_company",
      columns: [t.planId, t.companyId],
      foreignColumns: [costPlans.id, costPlans.companyId],
    }),
    uniqueIndex("plan_erp_outbox_one_per_version").on(t.planId, t.planVersion, t.eventType),
    index("idx_plan_erp_outbox_due").on(t.nextAttemptAt).where(sql`status IN ('PENDING', 'FAILED')`),
    index("idx_plan_erp_outbox_plan").on(t.planId, t.createdAt),
    check("plan_erp_outbox_event_type", sql`${t.eventType} IN ('UPSERT', 'CANCEL')`),
    check(
      "plan_erp_outbox_status",
      sql`${t.status} IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'SKIPPED')`,
    ),
    check("plan_erp_outbox_attempts", sql`${t.attempts} BETWEEN 0 AND 100`),
    check("plan_erp_outbox_plan_version_positive", sql`${t.planVersion} >= 1`),
    check("plan_erp_outbox_payload_object", sql`jsonb_typeof(${t.payload}) = 'object'`),
    check("plan_erp_outbox_result_object", sql`${t.result} IS NULL OR jsonb_typeof(${t.result}) = 'object'`),
    check("plan_erp_outbox_last_error_len", sql`${t.lastError} IS NULL OR length(${t.lastError}) <= 2000`),
  ],
);

// 상태값 상수 — text + CHECK 와 일치시킨다 (enum 을 만들지 않는다, P5)
export const COST_PLAN_STATUS = ["PLANNED", "CANCELLED", "CLOSED"] as const;
export const COST_PLAN_DATE_PRECISION = ["DAY", "MONTH_EARLY", "MONTH_MID", "MONTH"] as const;
export const PLAN_EVIDENCE_DOCUMENT_TYPE = ["ESTIMATE", "INVOICE", "CONTRACT", "RECEIPT", "OTHER"] as const;
export const PLAN_EVIDENCE_UPLOAD_STATUS = ["PENDING", "UPLOADED", "FAILED"] as const;
export const PLAN_ERP_EVENT_TYPE = ["UPSERT", "CANCEL"] as const;
export const PLAN_ERP_OUTBOX_STATUS = ["PENDING", "PROCESSING", "DONE", "FAILED", "SKIPPED"] as const;

export type PlanExecutive = typeof planExecutives.$inferSelect;
export type PlanBrand = typeof planBrands.$inferSelect;
export type NewPlanBrand = typeof planBrands.$inferInsert;
export type PlanProject = typeof planProjects.$inferSelect;
export type NewPlanProject = typeof planProjects.$inferInsert;
export type PlanProjectMember = typeof planProjectMembers.$inferSelect;
export type CostPlan = typeof costPlans.$inferSelect;
export type NewCostPlan = typeof costPlans.$inferInsert;
export type PlanExpenseLink = typeof planExpenseLinks.$inferSelect;
export type NewPlanExpenseLink = typeof planExpenseLinks.$inferInsert;
export type PlanComment = typeof planComments.$inferSelect;
export type NewPlanComment = typeof planComments.$inferInsert;
export type PlanCommentRead = typeof planCommentReads.$inferSelect;
export type PlanEvidence = typeof planEvidence.$inferSelect;
export type NewPlanEvidence = typeof planEvidence.$inferInsert;
export type PlanChangeLog = typeof planChangeLog.$inferSelect;
export type NewPlanChangeLog = typeof planChangeLog.$inferInsert;
export type PlanErpOutbox = typeof planErpOutbox.$inferSelect;
export type NewPlanErpOutbox = typeof planErpOutbox.$inferInsert;
