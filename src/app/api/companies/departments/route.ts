import { NextResponse } from "next/server";
import { requireAdmin, handleError } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// GET /api/companies/departments — list distinct departments (ADMIN only)
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    await requireAdmin();

    const rows = await db
      .selectDistinct({ department: users.department })
      .from(users)
      .where(sql`${users.department} is not null and ${users.department} != ''`)
      .orderBy(users.department);

    const data = rows
      .map((r) => r.department)
      .filter((d): d is string => d !== null);

    return NextResponse.json({ data });
  } catch (err) {
    return handleError(err);
  }
}
