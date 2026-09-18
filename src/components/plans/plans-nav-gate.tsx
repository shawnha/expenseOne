"use client";

import { useEffect, useState, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// 비용계획 메뉴 게이트.
//
// 사이드바·탭 바는 **모든 화면**에 있다. 여기서 계획 코드를 부르거나 화면마다 DB를 한 번 더
// 읽으면 스위치가 꺼져 있는 사람까지 값을 치른다(P6·P7). 그래서 이 파일은 계획 쪽 모듈을
// 하나도 import 하지 않고, 판단은 `/api/plans/flag` 한 번의 fetch로 끝낸 뒤 모듈 메모리에
// 담아 둔다 — 탭을 열어 둔 동안 다시 묻지 않는다. 짧게 쓴 이유도 같다: 이 코드는 모든 화면의
// 레이아웃 묶음에 들어간다.
//
// 모르면 숨긴다(fail-closed). 네트워크 오류·401, 그리고 **JSON이 아닌 응답**까지 전부 OFF다.
// 마지막 경우가 실제로 일어난다 — 세션 쿠키가 없으면 미들웨어가 /login으로 307을 주고 fetch는
// 리디렉션을 따라가 200 + HTML을 돌려준다(src/middleware.ts). 상태 코드만 보면 켜진 줄 안다.
// ---------------------------------------------------------------------------

let cached: boolean | null = null;
let inFlight: Promise<boolean> | null = null;

function loadFlag(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached);
  inFlight ??= fetch("/api/plans/flag", { headers: { Accept: "application/json" } })
    .then((res) =>
      res.ok && (res.headers.get("content-type") ?? "").includes("json") ? res.json() : null,
    )
    .catch(() => null)
    .then((json: { data?: { enabled?: boolean } } | null) => {
      inFlight = null;
      // **실패는 캐시하지 않는다.** 답이 오지 않은 것과 OFF 는 다르다 — 한 번 튄 응답을 false 로
      // 굳혀 두면 소유자가 스위치를 켜도 그 창을 완전히 새로고침할 때까지 메뉴가 영영 안 뜬다.
      if (json == null) return false;
      cached = json.data?.enabled === true;
      return cached;
    });
  return inFlight;
}

/**
 * 스위치가 켜진 사람에게만 children 을 보여 준다.
 *
 * 서버 렌더와 첫 클라이언트 렌더는 항상 null 이라 hydration 이 어긋나지 않는다(모듈 캐시가 비어 있다).
 * 두 번째 이후 마운트는 캐시된 값으로 바로 그려서 메뉴가 깜빡이지 않는다.
 */
export function PlansNavGate({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => cached === true);

  useEffect(() => {
    let alive = true;
    void loadFlag().then((value) => {
      if (alive) setEnabled(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  return enabled ? <>{children}</> : null;
}
