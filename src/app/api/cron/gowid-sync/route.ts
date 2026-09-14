import { NextResponse } from "next/server";
import { syncGowidTransactions } from "@/services/gowid.service";
import { verifyCronAuth } from "@/lib/cron-auth";
import { syncErpCardTransactions } from "@/services/erp-card-sync.service";

// 고위드 동기화는 계정 전체를 페이지로 훑고 카드까지 맞추느라 길어질 수 있다.
// 60초로 두었을 때 ERP 동기화가 9/7 배포 후 한 번도 저장까지 가지 못했다
// (codef 스테이징 0건). Hobby 최대치인 300초로 둔다.
export const maxDuration = 300;

export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  // ERP(코데프) 카드 거래를 **먼저, 독립적으로** 처리한다.
  //
  // 예전엔 고위드 동기화가 성공한 **뒤에만** ERP를 돌렸다. 그래서 고위드가
  // 예외를 던지거나 시간 제한에 걸리면 ERP는 아예 실행되지 않았다 — 파트너스·
  // 우리카드 거래가 한 건도 안 들어온 원인. ERP는 수 초면 끝나니 앞에 둔다.
  // 새 cron 항목을 만들지 않는 이유: 같은 주기이고 Hobby는 하루 1회로 묶여 있다.
  let erp: unknown = null;
  try {
    erp = await syncErpCardTransactions();
    console.log("[ERP Card Sync]", erp);
  } catch (err) {
    console.error("[ERP Card Sync] Error:", err);
    erp = { error: err instanceof Error ? err.message : "erp sync failed" };
  }

  try {
    const result = await syncGowidTransactions();
    console.log("[GoWid Sync]", result);
    return NextResponse.json({ ok: true, ...result, erp });
  } catch (error) {
    console.error("[GoWid Sync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sync failed", erp },
      { status: 500 },
    );
  }
}
