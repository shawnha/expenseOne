import { NextResponse } from "next/server";
import { processCodefNotifications } from "@/services/codef-notify.service";
import { verifyCronAuth } from "@/lib/cron-auth";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

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
