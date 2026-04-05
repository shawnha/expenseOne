import { NextResponse } from "next/server";
import { getExchangeRate } from "@/services/exchange-rate.service";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const currency = searchParams.get("currency") || "USD";

  const result = await getExchangeRate(currency);
  if (!result) {
    return NextResponse.json(
      { error: { code: "EXCHANGE_RATE_UNAVAILABLE", message: "환율 정보를 조회할 수 없습니다" } },
      { status: 503 },
    );
  }

  return NextResponse.json(result);
}
