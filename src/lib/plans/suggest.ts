import { parseIsoDate } from "./diff";

// ---------------------------------------------------------------------------
// 입금요청 자동 연결 **제안** 점수 (DB·React 없음, 단위 테스트 대상)
//
// 제안만 한다 — 연결은 사람이 누른다. 잘못 이어진 연결은 그 순간의 금액을 스냅샷으로 얼려 버리므로
// (결정 1-2) 자동으로 잇지 않는다. 서버는 같은 법인의 후보를 넓게 골라 오고, 점수·순위는 여기서 매긴다.
//
// 후보 자격(둘 중 하나): |요청 날짜 − 예정일| ≤ 45일  OR  금액이 계획의 0.8~1.25배.
// 점수 = 날짜 근접(0~1) + 금액 근접(0~1) + 제목 겹침(0~1). 셋 다 0~1 이라 한 축이 다른 축을 삼키지 않는다.
// ---------------------------------------------------------------------------

export const SUGGEST_DATE_WINDOW_DAYS = 45;
export const SUGGEST_AMOUNT_MIN_RATIO = 0.8;
export const SUGGEST_AMOUNT_MAX_RATIO = 1.25;
export const SUGGEST_LIMIT = 5;

export interface SuggestPlan {
  amount: number;
  plannedDate: string;
  title: string;
}

export interface SuggestCandidate {
  id: string;
  amount: number;
  /** COALESCE(due_date, transaction_date, created_at)::date — 서버가 이 형태로 준다. "YYYY-MM-DD" */
  date: string;
  title: string;
}

export interface ScoredCandidate<T extends SuggestCandidate> {
  candidate: T;
  score: number;
  /** 예정일과의 차이(일). 요청이 더 늦으면 양수. */
  dateDiffDays: number;
  /** 화면에 보여 줄 근거. 날짜·금액·제목 중 잡힌 것만. */
  reasons: Array<"date" | "amount" | "title">;
}

/** "YYYY-MM-DD" 둘 사이의 일수(b − a). 시간대 없이 UTC 자정으로 센다. 형식이 틀리면 null. */
export function daysBetween(a: string, b: string): number | null {
  const pa = parseIsoDate(a);
  const pb = parseIsoDate(b);
  if (!pa || !pb) return null;
  const ta = Date.UTC(pa.year, pa.month - 1, pa.day);
  const tb = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((tb - ta) / 86_400_000);
}

/** 날짜 근접: 0일 = 1, 45일 = 0, 그 밖은 0. */
export function dateProximity(diffDays: number): number {
  const d = Math.abs(diffDays);
  if (d > SUGGEST_DATE_WINDOW_DAYS) return 0;
  return 1 - d / SUGGEST_DATE_WINDOW_DAYS;
}

/**
 * 금액 근접: 같으면 1, 0.8배·1.25배에서 0(로그 비율이라 위아래가 대칭), 범위 밖은 0.
 * 계획 금액이 0 이하면 비교할 수 없으니 0.
 */
export function amountCloseness(planAmount: number, candidateAmount: number): number {
  if (planAmount <= 0 || candidateAmount <= 0) return 0;
  const ratio = candidateAmount / planAmount;
  if (ratio < SUGGEST_AMOUNT_MIN_RATIO || ratio > SUGGEST_AMOUNT_MAX_RATIO) return 0;
  const span = Math.log(SUGGEST_AMOUNT_MAX_RATIO);
  return Math.max(0, 1 - Math.abs(Math.log(ratio)) / span);
}

/** 제목 토큰: 소문자, 글자·숫자만 남기고 2글자 이상. "9월 인플루언서 캠페인" → {9월, 인플루언서, 캠페인} */
export function titleTokens(title: string): Set<string> {
  const out = new Set<string>();
  for (const raw of title.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length >= 2) out.add(raw);
  }
  return out;
}

/** 제목 겹침(자카드). 한쪽이 비어 있으면 0. */
export function titleOverlap(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * 후보 하나의 점수. 자격이 없으면(날짜도 멀고 금액도 다르면) null.
 * 날짜를 읽을 수 없는 후보는 금액으로만 판단한다.
 */
export function scoreCandidate<T extends SuggestCandidate>(plan: SuggestPlan, candidate: T): ScoredCandidate<T> | null {
  const diff = daysBetween(plan.plannedDate, candidate.date);
  const dateScore = diff === null ? 0 : dateProximity(diff);
  const amountScore = amountCloseness(plan.amount, candidate.amount);
  const inDateWindow = diff !== null && Math.abs(diff) <= SUGGEST_DATE_WINDOW_DAYS;
  const inAmountBand = amountScore > 0 || isWithinAmountBand(plan.amount, candidate.amount);
  if (!inDateWindow && !inAmountBand) return null;

  const title = titleOverlap(plan.title, candidate.title);
  const reasons: ScoredCandidate<T>["reasons"] = [];
  if (inDateWindow) reasons.push("date");
  if (inAmountBand) reasons.push("amount");
  if (title > 0) reasons.push("title");
  return {
    candidate,
    score: dateScore + amountScore + title,
    dateDiffDays: diff ?? Number.NaN,
    reasons,
  };
}

function isWithinAmountBand(planAmount: number, candidateAmount: number): boolean {
  if (planAmount <= 0) return false;
  const ratio = candidateAmount / planAmount;
  return ratio >= SUGGEST_AMOUNT_MIN_RATIO && ratio <= SUGGEST_AMOUNT_MAX_RATIO;
}

/**
 * 후보 목록을 점수 순으로 잘라 준다. 동점이면 날짜가 가까운 쪽, 그다음 입력 순서(서버가 최근순으로 준다).
 */
export function rankSuggestions<T extends SuggestCandidate>(
  plan: SuggestPlan,
  candidates: readonly T[],
  limit = SUGGEST_LIMIT,
): ScoredCandidate<T>[] {
  const scored: Array<ScoredCandidate<T> & { index: number }> = [];
  candidates.forEach((candidate, index) => {
    const s = scoreCandidate(plan, candidate);
    if (s) scored.push({ ...s, index });
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const da = Number.isNaN(a.dateDiffDays) ? Infinity : Math.abs(a.dateDiffDays);
    const db = Number.isNaN(b.dateDiffDays) ? Infinity : Math.abs(b.dateDiffDays);
    if (da !== db) return da - db;
    return a.index - b.index;
  });
  return scored.slice(0, Math.max(0, limit)).map((s) => ({
    candidate: s.candidate,
    score: s.score,
    dateDiffDays: s.dateDiffDays,
    reasons: s.reasons,
  }));
}
