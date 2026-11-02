"use client"

import * as React from "react"

import { scrollFadeEdges, scrollFadeMask, type FadeEdges } from "@/lib/ui/scroll-fade"
import { cn } from "@/lib/utils"

/**
 * 세로 스크롤 요소의 가장자리 페이드. 숨은 내용이 있는 쪽만 흐려진다.
 * 반환한 ref 를 스크롤 요소에 달고 style 을 합친다. .glass 래퍼가 아닌 스크롤 요소 자체에 적용할 것.
 */
export function useScrollFade<T extends HTMLElement>() {
  const [el, setEl] = React.useState<T | null>(null)
  const [edges, setEdges] = React.useState<FadeEdges>({ top: false, bottom: false })

  React.useEffect(() => {
    if (!el) return
    const update = () => {
      const next = scrollFadeEdges(el.scrollTop, el.scrollHeight, el.clientHeight)
      setEdges((prev) => (prev.top === next.top && prev.bottom === next.bottom ? prev : next))
    }
    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    // 자식이 늘거나 줄어도 다시 계산
    const mo = new MutationObserver(update)
    mo.observe(el, { childList: true, subtree: true })
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
      mo.disconnect()
    }
  }, [el])

  const mask = scrollFadeMask(edges)
  const style: React.CSSProperties | undefined = mask
    ? { maskImage: mask, WebkitMaskImage: mask }
    : undefined
  return { ref: setEl, style }
}

type ScrollFadeProps<T extends React.ElementType> = {
  as?: T
  className?: string
  style?: React.CSSProperties
  ref?: React.Ref<HTMLElement>
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "style">

/** 스크롤 요소를 직접 렌더링한다. 호출자가 overflow-y-auto 와 max-h 를 className 으로 준다. */
export function ScrollFade<T extends React.ElementType = "div">({
  as,
  className,
  style,
  ref,
  ...props
}: ScrollFadeProps<T>) {
  const Comp: React.ElementType = as ?? "div"
  const fade = useScrollFade<HTMLElement>()
  const setRef = React.useCallback(
    (node: HTMLElement | null) => {
      fade.ref(node)
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ref],
  )
  return (
    <Comp
      {...props}
      ref={setRef}
      className={cn(className)}
      style={{ ...style, ...fade.style }}
    />
  )
}
