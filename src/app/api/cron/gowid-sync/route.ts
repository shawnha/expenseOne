import { NextResponse } from "next/server";
import { syncGowidTransactions } from "@/services/gowid.service";
import { verifyCronAuth } from "@/lib/cron-auth";
import { syncErpCardTransactions } from "@/services/erp-card-sync.service";

export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const result = await syncGowidTransactions();
    console.log("[GoWid Sync]", result);

    // ERP(코데프)로 들어오는 카드 거래도 같은 cron에서 처리한다.
    // 고위드 계정이 없는 법인(파트너스 등)이 대상이다. 새 cron 항목을 만들지
    // 않는 이유: Vercel 요금제별 cron 개수 제한이 있고 어차피 같은 주기다.
    // 실패해도 고위드 결과에는 영향을 주지 않는다.
    let erp: unknown = null;
    try {
      erp = await syncErpCardTransactions();
      console.log("[ERP Card Sync]", erp);
    } catch (err) {
      console.error("[ERP Card Sync] Error:", err);
      erp = { error: err instanceof Error ? err.message : "erp sync failed" };
    }

    return NextResponse.json({ ok: true, ...result, erp });
  } catch (error) {
    console.error("[GoWid Sync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sync failed" },
      { status: 500 },
    );
  }
}
