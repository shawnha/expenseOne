import { NextResponse } from "next/server";
import { requireAdmin, handleError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { users, departments } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// GET /api/companies/departments — list distinct departments (ADMIN only)
// Combines normalized department names (departments.name where users link
// via department_id) with the legacy users.department string column for
// users that haven't been migrated yet.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    await requireAdmin();

    const rows = await db
      .selectDistinct({
        normalized: departments.name,
        legacy: users.department,
      })
      .from(users)
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(
        sql`(${departments.name} is not null)
           OR (${users.department} is not null AND ${users.department} <> '')`,
      );

    const seen = new Set<string>();
    const data: string[] = [];
    for (const r of rows) {
      const name = r.normalized ?? r.legacy;
      if (name && !seen.has(name)) {
        seen.add(name);
        data.push(name);
      }
    }
    data.sort((a, b) => a.localeCompare(b, "ko"));

    return NextResponse.json({ data });
  } catch (err) {
    return handleError(err);
  }
}
