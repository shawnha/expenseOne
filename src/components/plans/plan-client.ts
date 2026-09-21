import { formatKRW } from "@/lib/utils/expense-utils";

// ---------------------------------------------------------------------------
// 계획 화면이 공유하는 아주 작은 클라이언트 유틸. 이 파일은 /plans 묶음에만 들어간다
// (사이드바·탭 바는 plans-nav-gate.tsx 만 쓴다).
// ---------------------------------------------------------------------------

export type PlanApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code?: string };

/**
 * 계획 API 호출. 성공하면 `{ data }` 의 알맹이를, 실패하면 화면에 그대로 띄울 한국어 문구를 준다.
 *
 * JSON 이 아닌 응답을 따로 잡는 이유는 메뉴 게이트와 같다 — 세션이 끊기면 미들웨어가
 * /login 으로 보내고 fetch 는 그 HTML 을 200 으로 받는다. res.json() 이 터지기 전에 막는다.
 */
export async function planFetch<T>(url: string, init?: RequestInit): Promise<PlanApiResult<T>> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!(res.headers.get("content-type") ?? "").includes("application/json")) {
      return { ok: false, message: "세션이 만료되었습니다. 새로고침 후 다시 시도해주세요." };
    }
    const json = (await res.json()) as { data?: T; error?: { code?: string; message?: string } };
    if (!res.ok) {
      return {
        ok: false,
        code: json.error?.code,
        message: json.error?.message ?? "요청을 처리하지 못했습니다.",
      };
    }
    return { ok: true, data: json.data as T };
  } catch {
    return { ok: false, message: "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }
}

/** 본문이 있는 변경 요청. Origin 헤더는 브라우저가 붙여 준다(validateOrigin). */
export function jsonBody(body: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(body) };
}

// --- 날짜 -----------------------------------------------------------------------

/** "2026-09" → "2026년 9월" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y}년 ${Number(m)}월`;
}

/** "2026-09" 을 delta 달만큼 민다. 연도 넘김은 Date 가 맡는다. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 로컬 시각 기준 YYYY-MM-DD. toISOString 은 UTC 라 자정 근처에서 하루가 밀린다. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "2026-09-30" → Date(로컬 자정). new Date("2026-09-30") 은 UTC 로 읽혀 하루 밀린다. */
export function fromISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** ISO 타임스탬프 → "2026.09.18 14:30" */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  return `${date} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// --- 차이 배지 -------------------------------------------------------------------

export interface DiffBadge {
  label: string;
  tone: "green" | "orange" | "red";
}

/**
 * 차이(= 계획 금액 − 활성 스냅샷 합계)를 배지 한 줄로.
 * 연결이 하나도 없으면 배지를 달지 않는다(아직 요청 전이라 "남음"이 정보가 아니다).
 */
export function diffBadge(diff: number, linkCount: number): DiffBadge | null {
  if (linkCount === 0) return null;
  if (diff === 0) return { label: "계획과 일치", tone: "green" };
  if (diff > 0) return { label: `${formatKRW(diff)} 남음`, tone: "orange" };
  return { label: `${formatKRW(-diff)} 초과`, tone: "red" };
}

export const PLAN_STATUS_LABEL: Record<string, string> = {
  PLANNED: "예정",
  CANCELLED: "취소됨",
  CLOSED: "마감",
};

/** 연결된 입금요청의 현재 상태. 계획에서 쓰는 값만 담는다. */
export const EXPENSE_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "제출",
  APPROVED: "승인",
  REJECTED: "반려",
  CANCELLED: "취소",
};
