/** 드롭 영역 자석 효과 계산. 훅은 hooks/use-magnetic-drop.ts */

export const MAGNETIC_MAX_PX = 6;
export const MAGNETIC_FACTOR = 0.08;

export interface Offset {
  x: number;
  y: number;
}

function clamp(v: number, max: number): number {
  return Math.max(-max, Math.min(max, v));
}

/** 영역 중심 → 포인터 벡터에 factor 를 곱하고 ±max 로 자른다. */
export function magneticOffset(
  pointer: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  max: number = MAGNETIC_MAX_PX,
  factor: number = MAGNETIC_FACTOR,
): Offset {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const x = clamp((pointer.x - cx) * factor, max);
  const y = clamp((pointer.y - cy) * factor, max);
  // -0 방지
  return { x: x + 0, y: y + 0 };
}
