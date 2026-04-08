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
  check,
  numeric,
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
