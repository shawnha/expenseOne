import { NextResponse } from "next/server";
import { syncGowidTransactions } from "@/services/gowid.service";
import { verifyCronAuth } from "@/lib/cron-auth";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

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
