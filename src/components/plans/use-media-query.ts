import { useCallback, useSyncExternalStore } from "react";

/**
 * matchMedia 를 React 상태로. 서버·하이드레이션 첫 렌더는 false — 클라이언트에서 값이 정해지면
 * 한 번 더 그린다(레이아웃이 아니라 동작 스위치에만 쓴다: 드래그 허용 여부 등).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** 마우스가 있는 환경(hover + fine pointer). HTML5 드래그는 여기서만 켠다. */
export const DESKTOP_POINTER_QUERY = "(hover: hover) and (pointer: fine)";
