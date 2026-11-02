/** 길게 눌러 확인 버튼의 순수 계산. 컴포넌트는 hold-to-confirm-button.tsx */

export const HOLD_DEFAULT_MS = 1100;
/** 버튼 밖으로 이만큼(px) 벗어나면 취소한다. */
export const HOLD_CANCEL_DISTANCE_PX = 8;
export const HOLD_RETRACT_MS = 180;

export interface Point {
  x: number;
  y: number;
}
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 경과 시간 → 진행률 0~1. duration 이 0 이하면 즉시 완료. */
export function holdProgress(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
  return Math.min(1, elapsedMs / durationMs);
}

/** 점이 사각형 밖으로 벗어난 거리(안쪽이면 0). */
export function distanceOutsideBox(p: Point, box: Box): number {
  const dx = Math.max(box.left - p.x, 0, p.x - box.right);
  const dy = Math.max(box.top - p.y, 0, p.y - box.bottom);
  return Math.hypot(dx, dy);
}

/** 포인터가 버튼에서 threshold 보다 멀리 벗어났으면 true. */
export function shouldCancelHold(
  p: Point,
  box: Box,
  threshold: number = HOLD_CANCEL_DISTANCE_PX,
): boolean {
  return distanceOutsideBox(p, box) > threshold;
}
