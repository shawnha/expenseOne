import { date, pgSchema, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

const schema = pgSchema("expenseone");

export const brandSettlementViewers = schema.table(
  "brand_settlement_viewers",
  {
    userId: uuid("user_id").notNull(),
    companyId: uuid("company_id").notNull(),
    grantedById: uuid("granted_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.companyId] })],
);

export const brandSettlementSubjects = schema.table(
  "brand_settlement_subjects",
  {
    sourceType: text("source_type").$type<"PLAN" | "REQUEST">().notNull(),
    sourceId: uuid("source_id").notNull(),
    companyId: uuid("company_id").notNull(),
    brandName: varchar("brand_name", { length: 100 }).notNull(),
    periodMonth: date("period_month", { mode: "string" }).notNull(),
    updatedById: uuid("updated_by_id").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.sourceType, table.sourceId] })],
);
