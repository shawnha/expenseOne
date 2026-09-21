import { useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// 이중 제출 잠금(QA D-04).
//
// `saving`/`busy` 같은 React 상태는 첫 클릭의 setState 가 반영되기 **전에** 같은 틱의 두 번째 클릭이
// 통과한다(모바일 더블탭). ref 는 그 자리에서 바로 바뀌므로 두 번째 호출은 들어오지 못한다.
// 버튼 disabled(상태)는 그대로 둔다 — 화면 표시용이다.
// ---------------------------------------------------------------------------

/**
 * `run(fn)` 은 잠겨 있으면 아무것도 하지 않고(undefined), 아니면 잠그고 fn 을 끝까지 돌린 뒤 푼다.
 * 컴포넌트 하나에 하나만 두고, 그 컴포넌트의 모든 쓰기 핸들러가 같은 잠금을 쓴다.
 */
export function useSubmitLock(): <T>(fn: () => Promise<T>) => Promise<T | undefined> {
  const locked = useRef(false);
  return useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (locked.current) return undefined;
    locked.current = true;
    try {
      return await fn();
    } finally {
      locked.current = false;
    }
  }, []);
}
