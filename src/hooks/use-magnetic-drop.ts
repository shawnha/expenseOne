"use client";

import { useCallback, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { magneticOffset, type Offset } from "@/lib/ui/magnetic";

/**
 * 파일 드롭 영역 공용 훅. 드래그 중에는 영역이 살짝 커지고(1.02) 안쪽 내용이 포인터 쪽으로 최대 6px 끌려간다.
 * 모션 줄이기면 하이라이트(isDragOver)만 켜고 크기·이동은 없다.
 */
export function useMagneticDrop() {
  const reduced = useReducedMotion();
  const [isDragOver, setIsDragOver] = useState(false);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);

  const reset = useCallback(() => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    setIsDragOver(false);
    setOffset({ x: 0, y: 0 });
  }, []);

  const onDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      setIsDragOver(true);
      if (reduced) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pointer = { x: e.clientX, y: e.clientY };
      if (raf.current !== null) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        setOffset((prev) => {
          const next = magneticOffset(pointer, rect);
          return prev.x === next.x && prev.y === next.y ? prev : next;
        });
      });
    },
    [reduced],
  );

  const onDragLeave = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      // 자식 요소 위로 옮겨 갈 때는 유지
      const next = e.relatedTarget;
      if (next instanceof Node && e.currentTarget.contains(next)) return;
      reset();
    },
    [reset],
  );

  const active = isDragOver && !reduced;
  const zoneStyle: CSSProperties = {
    transform: active ? "scale(1.02)" : undefined,
    transition: "transform 150ms ease-out, border-color 150ms, background-color 150ms",
  };
  const contentStyle: CSSProperties = {
    transform: active ? `translate(${offset.x}px, ${offset.y}px)` : undefined,
    transition: "transform 150ms ease-out",
  };

  return { isDragOver, onDragOver, onDragLeave, reset, zoneStyle, contentStyle };
}
