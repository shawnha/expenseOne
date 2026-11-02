/** 스크롤 영역 가장자리 페이드 계산. 컴포넌트는 components/ui/scroll-fade.tsx */

export const SCROLL_FADE_SIZE_PX = 20;
const TOLERANCE_PX = 1;

export interface FadeEdges {
  top: boolean;
  bottom: boolean;
}

/** 숨은 내용이 있는 가장자리만 true. 1px 오차는 무시한다(소수 스크롤 값 대응). */
export function scrollFadeEdges(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): FadeEdges {
  const hidden = scrollHeight - clientHeight;
  if (!(hidden > TOLERANCE_PX)) return { top: false, bottom: false };
  return {
    top: scrollTop > TOLERANCE_PX,
    bottom: scrollTop < hidden - TOLERANCE_PX,
  };
}

/** mask-image 값. 페이드가 필요 없으면 undefined. */
export function scrollFadeMask(edges: FadeEdges, size: number = SCROLL_FADE_SIZE_PX): string | undefined {
  if (!edges.top && !edges.bottom) return undefined;
  const start = edges.top ? `transparent 0, #000 ${size}px` : `#000 0`;
  const end = edges.bottom ? `#000 calc(100% - ${size}px), transparent 100%` : `#000 100%`;
  return `linear-gradient(to bottom, ${start}, ${end})`;
}
