import { sql } from "drizzle-orm";

export const visibleExpenseCompanies = (userId: string) => sql`
  SELECT c.id, c.name, c.slug, c.sort_order
    FROM expenseone.companies c
    JOIN expenseone.users u ON u.id = ${userId}::uuid AND u.is_active = true
   WHERE u.role = 'ADMIN' OR (c.is_active = true AND EXISTS (
       SELECT 1 FROM expenseone.brand_settlement_viewers v
       WHERE v.user_id = u.id AND v.company_id = c.id
     ))`;
