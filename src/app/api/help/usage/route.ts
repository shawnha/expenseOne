import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { errorResponse, handleError, requireAdmin, requireAuth, validateOrigin } from "@/lib/api-utils";

const usageSchema = z.strictObject({
  viewport: z.enum(["mobile", "desktop"]),
  tabKey: z.uuidv4(),
  event: z.enum(["view", "click"]),
});

const today = sql`(now() AT TIME ZONE 'Asia/Seoul')::date`;

export async function POST(request: NextRequest) {
  const forbidden = validateOrigin(request);
  if (forbidden) return forbidden;
  const parsed = usageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("VALIDATION_ERROR", "사용법 집계 값이 올바르지 않습니다.");

  try {
    await requireAuth();
  } catch (error) {
    return handleError(error);
  }

  const { viewport, tabKey, event } = parsed.data;
  try {
    // 클릭이 먼저 도착하거나 노출이 늦게 재전송되어도 클릭 여부를 유지한다.
    await db.execute(sql`
      INSERT INTO expenseone.help_usage (day, viewport, tab_key, clicked)
      VALUES (${today}, ${viewport}, ${tabKey}::uuid, ${event === "click"})
      ON CONFLICT (day, viewport, tab_key) DO UPDATE SET clicked = true
      WHERE excluded.clicked AND NOT help_usage.clicked
    `);
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    return handleError(error);
  }

  try {
    const rows = await db.execute<{ viewport: "mobile" | "desktop"; views: number; clicks: number }>(sql`
      SELECT viewport, count(*)::int AS views, count(*) FILTER (WHERE clicked)::int AS clicks
        FROM expenseone.help_usage
       WHERE day BETWEEN ${today} - 6 AND ${today}
       GROUP BY viewport
    `);
    return NextResponse.json({ data: Array.from(rows) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: { message: "사용법 통계를 불러올 수 없습니다." } }, { status: 503 });
  }
}
