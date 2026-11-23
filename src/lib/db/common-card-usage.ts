import { date, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { expenseSchema } from "@/lib/db/schema";

export const commonCardUsage = expenseSchema.table("common_card_usage", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull(),
  mappingId: uuid("mapping_id").notNull(),
  companyId: uuid("company_id").notNull(),
  lastFour: varchar("last_four", { length: 4 }).notNull(),
  startedOn: date("started_on", { mode: "string" }).notNull(),
  endedOn: date("ended_on", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
