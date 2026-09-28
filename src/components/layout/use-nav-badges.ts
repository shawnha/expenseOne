"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";

// ---------------------------------------------------------------------------
// 사이드 메뉴·탭 바 숫자(GET /api/nav/badges). 오너 요청(2026-09-28): 알림만으로는 무엇이 바뀌었는지 모른다.
//
// 모든 화면의 레이아웃에 들어가므로 계획 모듈을 하나도 import 하지 않는다(PlansNavGate 와 같은 이유).
// 모듈 메모리 한 곳에 두고 구독한다 — 사이드바·탭 바·홈 바로가기가 요청 한 번을 나눠 쓴다.
// 다시 묻는 때: 처음 뜰 때, 화면을 옮길 때, 탭으로 돌아올 때, 누가 'nav-badges-refresh' 를 쏠 때
// (계획 상세에서 본 기록을 남긴 뒤, 「모두 확인함」 뒤).
// ---------------------------------------------------------------------------

export interface NavBadges {
  /** 새 소식이 있는 계획 수. 비용계획을 못 쓰면 null. */
  plans: number | null;
  /** 승인 대기(관리자만). */
  pending: number | null;
}

const EMPTY: NavBadges = { plans: null, pending: null };
let state: NavBadges = EMPTY;
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let lastFetchedAt = 0;
const MIN_INTERVAL_MS = 5_000;

export const NAV_BADGES_REFRESH_EVENT = "nav-badges-refresh";

function emit() {
  for (const l of listeners) l();
}

/** 숫자를 다시 읽는다. force 가 아니면 5초 안의 중복 요청은 건너뛴다. */
export function refreshNavBadges(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (!force && Date.now() - lastFetchedAt < MIN_INTERVAL_MS) return Promise.resolve();
  lastFetchedAt = Date.now();
  inFlight = fetch("/api/nav/badges", { headers: { Accept: "application/json" }, cache: "no-store" })
    .then((res) =>
      // 세션이 끊기면 미들웨어가 /login 으로 보내 200 + HTML 이 온다 — JSON 이 아니면 무시한다.
      res.ok && (res.headers.get("content-type") ?? "").includes("json") ? res.json() : null,
    )
    .then((json: { data?: Partial<NavBadges> } | null) => {
      if (!json?.data) return;
      const next: NavBadges = {
        plans: typeof json.data.plans === "number" ? json.data.plans : null,
        pending: typeof json.data.pending === "number" ? json.data.pending : null,
      };
      if (next.plans !== state.plans || next.pending !== state.pending) {
        state = next;
        emit();
      }
    })
    .catch(() => {})
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** 다른 화면(계획 상세 등)에서 숫자를 새로 고치라고 알린다. */
export function requestNavBadgesRefresh(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NAV_BADGES_REFRESH_EVENT));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNavBadges(): NavBadges {
  const pathname = usePathname();
  const badges = useSyncExternalStore(subscribe, () => state, () => EMPTY);

  useEffect(() => {
    void refreshNavBadges();
  }, [pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshNavBadges();
    };
    const onRefresh = () => void refreshNavBadges(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(NAV_BADGES_REFRESH_EVENT, onRefresh);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(NAV_BADGES_REFRESH_EVENT, onRefresh);
    };
  }, []);

  return badges;
}

/** 0 이거나 모르면 null — 숫자 배지를 그리지 않는다. */
export function badgeCount(n: number | null | undefined): number | null {
  return typeof n === "number" && n > 0 ? n : null;
}

export function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}
