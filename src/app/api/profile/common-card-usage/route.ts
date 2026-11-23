import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, handleError, requireAuth, validateOrigin } from "@/lib/api-utils";
import { endCommonCardUsage, getCommonCardsForUser, startCommonCardUsage } from "@/services/common-card-usage.service";
import { sendPushToAdmins } from "@/services/push.service";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
const date = z.iso.date().refine((value) => value <= today(), "오늘까지의 날짜를 입력해 주세요.");
const start = z.object({ mappingId: z.uuid(), startedOn: date, endedOn: date.nullable() }).strict()
  .refine(({ startedOn, endedOn }) => !endedOn || startedOn <= endedOn);
const end = z.object({ id: z.uuid(), endedOn: date }).strict();

export async function GET() {
  try {
    const user = await requireAuth();
    return NextResponse.json({ data: await getCommonCardsForUser(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const originError = validateOrigin(request);
    if (originError) return originError;
    const user = await requireAuth();
    const input = start.safeParse(await request.json().catch(() => null));
    if (!input.success) return errorResponse("VALIDATION_ERROR", "공용 카드와 사용 기간을 확인해 주세요.");
    const { mappingId, startedOn, endedOn } = input.data;
    const entry = await startCommonCardUsage(user.id, mappingId, startedOn, endedOn);
    await sendPushToAdmins(
      "공용 카드 사용 등록",
      `${user.name} · •••• ${entry.lastFour} · ${entry.startedOn} ~ ${entry.endedOn ?? "사용 중"}`,
      "/admin/gowid#common-card-usage",
    ).catch(() => {});
    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const originError = validateOrigin(request);
    if (originError) return originError;
    const user = await requireAuth();
    const input = end.safeParse(await request.json().catch(() => null));
    if (!input.success) return errorResponse("VALIDATION_ERROR", "사용 종료일을 확인해 주세요.");
    const entry = await endCommonCardUsage(user.id, input.data.id, input.data.endedOn);
    await sendPushToAdmins(
      "공용 카드 사용 종료",
      `${user.name} · •••• ${entry.lastFour} · ${entry.startedOn} ~ ${entry.endedOn}`,
      "/admin/gowid#common-card-usage",
    ).catch(() => {});
    return NextResponse.json({ data: entry });
  } catch (error) {
    return handleError(error);
  }
}
