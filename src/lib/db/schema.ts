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
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const expenseSchema = pgSchema("expense");

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
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/**
 * users -- 사용자 테이블
 */
export const users = expenseSchema.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  role: userRoleEnum("role").notNull().default("MEMBER"),
  department: varchar("department", { length: 100 }),
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
    category: varchar("category", { length: 100 }).notNull(),
    merchantName: varchar("merchant_name", { length: 200 }),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
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

// ---------------------------------------------------------------------------
// TypeScript types (insert / select)
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;

export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
