import { NextResponse } from "next/server";
import { processCodefNotifications } from "@/services/codef-notify.service";

export const maxDuration = 60;

export async function GET(request: Request) {
  // Verify CRON_SECRET (also used as webhook auth)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await processCodefNotifications();
    console.log("[Codef Notify]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[Codef Notify] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "notify failed" },
      { status: 500 },
    );
  }
}

// POST also accepted (for FinanceOne webhook)
export async function POST(request: Request) {
  return GET(request);
}
