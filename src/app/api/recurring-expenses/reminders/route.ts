import { NextResponse } from "next/server";
import { handleError, requireAuth } from "@/lib/api-utils";
import { listOpenReminders } from "@/services/recurring-expense.service";

// GET — 알림은 갔지만 아직 입금요청을 안 올린 회차(최근 두 달). 반복 지급 화면의 「이번 회차 올리기」.
export async function GET() {
  try {
    const user = await requireAuth();
    const data = await listOpenReminders({ id: user.id, role: user.role });
    return NextResponse.json({ data });
  } catch (err) {
    return handleError(err);
  }
}
