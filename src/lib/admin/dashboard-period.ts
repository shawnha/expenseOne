// 관리자 대시보드 기간 계산 — 날짜는 한국 시간 기준(서버는 UTC라 new Date()의 날짜를 그대로 쓰면
// 밤 0시~9시 사이에 '오늘'이 하루 늦는다).

function kstParts(now: Date): { y: number; m: number; d: number } {
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth(), d: k.getUTCDate() };
}

function ymd(y: number, m: number, d: number): string {
  // m은 0부터. 넘치는 달/일은 Date.UTC가 정리해 준다.
  const t = new Date(Date.UTC(y, m, d));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** period: "YYYY-MM" | "3_months" | "6_months" | "this_year" | "this_month". 끝은 오늘을 넘지 않는다. */
export function getPeriodRange(period: string, now: Date = new Date()): { startDate: string; endDate: string } {
  const { y, m, d } = kstParts(now);
  const today = ymd(y, m, d);

  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const py = parseInt(monthMatch[1], 10);
    const pm = parseInt(monthMatch[2], 10) - 1;
    const lastDay = ymd(py, pm + 1, 0);
    return { startDate: ymd(py, pm, 1), endDate: lastDay < today ? lastDay : today };
  }

  switch (period) {
    case "3_months":
      return { startDate: ymd(y, m - 2, 1), endDate: today };
    case "6_months":
      return { startDate: ymd(y, m - 5, 1), endDate: today };
    case "this_year":
      return { startDate: ymd(y, 0, 1), endDate: today };
    default:
      return { startDate: ymd(y, m, 1), endDate: today };
  }
}

/** 추이 그래프 시작 — 기간 시작 달을 포함해 6개월 전 1일. */
export function trendStart(startDate: string): string {
  const [y, m] = startDate.split("-").map((s) => parseInt(s, 10));
  return ymd(y, m - 1 - 5, 1);
}
