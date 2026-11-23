import { timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { companies, expenseSchema } from "@/lib/db/schema";

export const personalCardNumbers = expenseSchema.table("personal_card_numbers", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  lastFour: varchar("last_four", { length: 4 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique().on(table.userId, table.companyId, table.lastFour)]);
