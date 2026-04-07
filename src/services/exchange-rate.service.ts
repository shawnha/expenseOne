// ---------------------------------------------------------------------------
// 한국수출입은행 환율 API 서비스
// ---------------------------------------------------------------------------

interface ExchangeRateCache {
  rate: number;
  date: string;
  fetchedAt: number;
}

const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const rateCache = new Map<string, ExchangeRateCache>();

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

interface KoreaEximResponse {
  result: number;
  cur_unit: string;
  cur_nm: string;
  ttb: string;
  tts: string;
  deal_bas_r: string;
  bkpr: string;
  yy_efee_r: string;
  ten_dd_efee_r: string;
  kftc_deal_bas_r: string;
  kftc_bkpr: string;
}

/**
 * 한국수출입은행 API에서 특정 날짜의 환율을 조회.
 * 영업일이 아닌 경우 빈 배열이 반환되므로 이전 날짜로 재시도.
 */
async function fetchRateFromAPI(
  currency: string,
  searchDate: Date,
): Promise<{ rate: number; date: string } | null> {
  const apiKey = process.env.KOREAEXIM_API_KEY;
  if (!apiKey) {
    console.error("[ExchangeRate] KOREAEXIM_API_KEY not set");
    return null;
  }

  // Try up to 5 days back (weekends, holidays)
  for (let i = 0; i < 5; i++) {
    const d = new Date(searchDate);
    d.setDate(d.getDate() - i);
    const dateStr = formatDate(d);

    try {
      const url = new URL(
        "https://www.koreaexim.go.kr/site/program/financial/exchangeJSON",
      );
      url.searchParams.set("authkey", apiKey);
      url.searchParams.set("searchdate", dateStr);
      url.searchParams.set("data", "AP01");

      const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
      if (!res.ok) continue;

      const data: KoreaEximResponse[] = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const entry = data.find((item) => item.cur_unit === currency);
      if (!entry) continue;

      // deal_bas_r has commas: "1,385.50" → 1385.50
      const rate = parseFloat(entry.deal_bas_r.replace(/,/g, ""));
      if (isNaN(rate) || rate <= 0) continue;

      return {
        rate,
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      };
    } catch (err) {
      console.error(`[ExchangeRate] API error for ${dateStr}:`, err);
    }
  }

  return null;
}

/**
 * USD→KRW 매매기준율을 조회 (캐시 적용).
 * @param currency 통화 코드 (기본: USD)
 * @param targetDate 환율 기준 날짜 (거래일). 미지정 시 오늘.
 */
export async function getExchangeRate(
  currency: string = "USD",
  targetDate?: Date | string,
): Promise<{ rate: number; date: string } | null> {
  const searchDate = targetDate
    ? typeof targetDate === "string" ? new Date(targetDate + "T12:00:00") : targetDate
    : new Date();

  // Cache key includes date for date-specific lookups
  const dateKey = formatDate(searchDate);
  const cacheKey = `${currency}:${dateKey}`;

  const cached = rateCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { rate: cached.rate, date: cached.date };
  }

  const result = await fetchRateFromAPI(currency, searchDate);
  if (result) {
    rateCache.set(cacheKey, {
      rate: result.rate,
      date: result.date,
      fetchedAt: Date.now(),
    });
  }

  return result;
}

/**
 * USD 센트 금액을 KRW로 변환.
 * @param amountCents USD 센트 단위 (예: 150000 = $1,500.00)
 * @param rate 환율 (예: 1385.50)
 * @returns KRW 원 단위 integer
 */
export function convertToKRW(amountCents: number, rate: number): number {
  return Math.round((amountCents / 100) * rate);
}
