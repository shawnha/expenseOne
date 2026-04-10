import { NextResponse } from "next/server";
import { syncGowidTransactions } from "@/services/gowid.service";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncGowidTransactions();
    console.log("[GoWid Sync]", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[GoWid Sync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sync failed" },
      { status: 500 },
    );
  }
}
