import {
  pgTable,
  pgSchema,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  date,
  char,
  pgEnum,
  index,
  uniqueIndex,
  check,
  numeric,
  jsonb,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Schema — 프로덕션 DB는 expenseone 스키마 사용
// ---------------------------------------------------------------------------

export const expenseSchema = pgSchema("expenseone");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = expenseSchema.enum("user_role", ["MEMBER", "ADMIN"]);

export const expenseTypeEnum = expenseSchema.enum("expense_type", [
  "CORPORATE_CARD",
  "DEPOSIT_REQUEST",
]);

export const expenseStatusEnum = expenseSchema.enum("expense_status", [
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

// expense_category: replaced with varchar to allow user-defined categories

export const documentTypeEnum = expenseSchema.enum("document_type", [
  "ESTIMATE",
  "BANK_COPY",
  "ID_CARD",
  "BIZ_LICENSE",
  "RECEIPT",
  "OTHER",
]);

export const notificationTypeEnum = expenseSchema.enum("notification_type", [
  "DEPOSIT_APPROVED",
  "DEPOSIT_REJECTED",
  "NEW_DEPOSIT_REQUEST",
  "REMAINING_PAYMENT_REQUEST",
  "REMAINING_PAYMENT_APPROVED",
  "NEW_USER_JOINED",
  "DUE_DATE_REMINDER",
  "CODEF_NEW_TRANSACTION",
  "CODEF_TRANSACTION_CANCELLED",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/**
 * companies -- 회사 테이블
 */
export const companies = expenseSchema.table("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).unique().notNull(),
  slug: varchar("slug", { length: 50 }).unique().notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KRW"),
  slackChannelId: varchar("slack_channel_id", { length: 50 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * departments -- 부서 테이블
 */
export const departments = expenseSchema.table(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_departments_company").on(table.companyId),
  ],
);

/**
 * users -- 사용자 테이블
 */
export const users = expenseSchema.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  role: userRoleEnum("role").notNull().default("MEMBER"),
  department: varchar("department", { length: 100 }),
  companyId: uuid("company_id").references(() => companies.id),
  profileImageUrl: text("profile_image_url"),
  cardLastFour: char("card_last_four", { length: 4 }),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * expenses -- 비용 테이블
 */
export const expenses = expenseSchema.table(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: expenseTypeEnum("type").notNull(),
    status: expenseStatusEnum("status").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("KRW"),
    amountOriginal: integer("amount_original"),
    exchangeRate: numeric("exchange_rate", { precision: 10, scale: 2 }),
    category: varchar("category", { length: 100 }).notNull(),
    merchantName: varchar("merchant_name", { length: 200 }),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }),
    cardLastFour: char("card_last_four", { length: 4 }),
    bankName: varchar("bank_name", { length: 50 }),
    accountHolder: varchar("account_holder", { length: 100 }),
    accountNumber: varchar("account_number", { length: 50 }),
    isUrgent: boolean("is_urgent").notNull().default(false),
    isPrePaid: boolean("is_pre_paid").notNull().default(false),
    prePaidPercentage: integer("pre_paid_percentage"),
    remainingPaymentRequested: boolean("remaining_payment_requested").notNull().default(false),
    remainingPaymentApproved: boolean("remaining_payment_approved").notNull().default(false),
    rejectionReason: text("rejection_reason"),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    submittedById: uuid("submitted_by_id")
      .notNull()
      .references(() => users.id),
    approvedById: uuid("approved_by_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // CHECK constraint: amount > 0
    check("amount_positive", sql`${table.amount} > 0`),

    // PRD 6.6 indexes
    index("idx_expenses_submitted_status").on(
      table.submittedById,
      table.status,
    ),
    index("idx_expenses_type_status_created").on(
      table.type,
      table.status,
      table.createdAt,
    ),
    index("idx_expenses_transaction_date").on(table.transactionDate),
    index("idx_expenses_company_type_status").on(
      table.companyId,
      table.type,
      table.status,
      table.createdAt,
    ),
  ],
);

/**
 * attachments -- 첨부파일 테이블
 */
export const attachments = expenseSchema.table(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    documentType: varchar("document_type", { length: 100 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileKey: varchar("file_key", { length: 500 }).notNull(),
    fileUrl: text("file_url").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_attachments_expense_id").on(table.expenseId),
    index("idx_attachments_uploaded_by").on(table.uploadedById),
  ],
);

/**
 * notifications -- 알림 테이블
 */
export const notifications = expenseSchema.table(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    message: text("message").notNull(),
    relatedExpenseId: uuid("related_expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
    linkUrl: text("link_url"),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // PRD 6.6 indexes
    index("idx_notifications_recipient_read").on(
      table.recipientId,
      table.isRead,
    ),
    index("idx_notifications_recipient_created").on(
      table.recipientId,
      table.createdAt,
    ),
  ],
);

/**
 * push_subscriptions -- Web Push 구독 테이블
 */
export const pushSubscriptions = expenseSchema.table(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_push_subs_user").on(table.userId),
  ],
);

/**
 * codef_connections -- Codef 연결 상태 (사용자별 카드사 연결)
 *
 * connectedId 는 AES-256-GCM 암호화 상태로 저장. 평문 금지.
 * 복호화는 src/lib/crypto/connected-id.ts 에서 처리.
 */
export const codefConnections = expenseSchema.table(
  "codef_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // base64(iv || ciphertext || authTag)
    connectedIdEncrypted: text("connected_id_encrypted").notNull(),
    cardCompany: varchar("card_company", { length: 20 }).notNull(),
    cardNoMasked: varchar("card_no_masked", { length: 20 }),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncStatus: varchar("last_sync_status", { length: 20 }),
    lastSyncError: text("last_sync_error"),
    // 지수 백오프: lastSyncStatus='error' 면 이 시각까지 skip
    backoffUntil: timestamp("backoff_until", { withTimezone: true }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_codef_conn_user").on(table.userId),
    index("idx_codef_conn_active_backoff").on(table.isActive, table.backoffUntil),
  ],
);

/**
 * codef_transactions_staging -- Codef 가 긁어온 거래 임시 보관함
 *
 * Dedup: (userId, resCardNo, resApprovalDate, resApprovalTime, resApprovalNo)
 *   → 같은 날 취소+재승인 케이스까지 충돌 방지.
 *
 * Idempotency: consumedExpenseId 에 partial UNIQUE index
 *   → 사용자 더블클릭/네트워크 retry 시에도 expense 중복 INSERT 방지.
 */
export const codefTransactionsStaging = expenseSchema.table(
  "codef_transactions_staging",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => codefConnections.id, { onDelete: "cascade" }),

    // Codef 원본 필드 (dedup key)
    resApprovalNo: varchar("res_approval_no", { length: 50 }).notNull(),
    resApprovalDate: varchar("res_approval_date", { length: 8 }).notNull(), // YYYYMMDD
    resApprovalTime: varchar("res_approval_time", { length: 6 }).notNull().default(""), // HHMMSS
    resCardNo: varchar("res_card_no", { length: 30 }).notNull(),

    // 표시용 (폼 prefill)
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("KRW"),
    merchantName: varchar("merchant_name", { length: 200 }),
    merchantType: varchar("merchant_type", { length: 100 }),
    isCancelled: boolean("is_cancelled").notNull().default(false),
    isOverseas: boolean("is_overseas").notNull().default(false),

    // 라이프사이클
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | consumed | dismissed | cancelled_by_card
    consumedExpenseId: uuid("consumed_expense_id").references(() => expenses.id, {
      onDelete: "set null",
    }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),

    // 감사 / 디버깅용 원본 페이로드
    rawPayload: jsonb("raw_payload"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_codef_stg_dedup").on(
      table.userId,
      table.resCardNo,
      table.resApprovalDate,
      table.resApprovalTime,
      table.resApprovalNo,
    ),
    uniqueIndex("idx_codef_stg_consumed_expense")
      .on(table.consumedExpenseId)
      .where(sql`consumed_expense_id IS NOT NULL`),
    index("idx_codef_stg_user_pending").on(table.userId, table.status),
    index("idx_codef_stg_connection").on(table.connectionId),
  ],
);

// ---------------------------------------------------------------------------
// TypeScript types (insert / select)
// ---------------------------------------------------------------------------

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;

export type CodefConnection = typeof codefConnections.$inferSelect;
export type NewCodefConnection = typeof codefConnections.$inferInsert;

export type CodefTransactionStaging = typeof codefTransactionsStaging.$inferSelect;
export type NewCodefTransactionStaging = typeof codefTransactionsStaging.$inferInsert;
