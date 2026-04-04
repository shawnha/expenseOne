import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expenses, users } from "@/lib/db/schema";
import { desc, count } from "drizzle-orm";
import { eq } from "drizzle-orm";

export async function GET() {
  const start = Date.now();
  try {
    const [countResult] = await db.select({ count: count() }).from(expenses);
    const items = await db
      .select({ title: expenses.title, status: expenses.status })
      .from(expenses)
      .orderBy(desc(expenses.createdAt))
      .limit(5);
    
    return NextResponse.json({
      ok: true,
      ms: Date.now() - start,
      count: countResult?.count ?? 0,
      items,
      env: {
        dbUrlSet: !!process.env.SUPABASE_DB_URL,
        dbUrlLength: (process.env.SUPABASE_DB_URL ?? "").length,
        dbUrlTrimmedLength: (process.env.SUPABASE_DB_URL ?? "").trim().length,
        dbUrlEndsWithNewline: (process.env.SUPABASE_DB_URL ?? "").endsWith("\n"),
      },
    });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json({
      ok: false,
      ms: Date.now() - start,
      error: err.message,
      stack: err.stack?.split("\n").slice(0, 5),
      env: {
        dbUrlSet: !!process.env.SUPABASE_DB_URL,
        dbUrlLength: (process.env.SUPABASE_DB_URL ?? "").length,
        dbUrlTrimmedLength: (process.env.SUPABASE_DB_URL ?? "").trim().length,
      },
    }, { status: 500 });
  }
}
