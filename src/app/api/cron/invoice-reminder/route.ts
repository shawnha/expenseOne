import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runInvoiceReminder } from "@/services/purchase-invoice-reminder.service";

// ---------------------------------------------------------------------------
// 사입 세금계산서 미발행 알림 — 수동/개별 실행용 엔드포인트.
//
// 실제 정기 실행은 `/api/cron/due-date-check`가 같이 처리한다. Vercel 요금제별
// cron 개수 제한에 걸리지 않도록 항목을 늘리지 않았고, 어차피 같은 시각(9시)에
// 돌기 때문이다. 이 라우트는 배포 후 즉시 확인하거나 재발송할 때 쓴다.
// ---------------------------------------------------------------------------
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return NextResponse.json(await runInvoiceReminder());
}
