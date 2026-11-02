"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { cn } from "@/lib/utils"

const WIDTH_EASE = "cubic-bezier(0.16, 1, 0.3, 1)"

/**
 * 라벨/아이콘이 바뀔 때 이전 내용은 위로 사라지고 새 내용이 아래에서 올라온다.
 * stateKey 가 같으면 내용만 갱신하고 움직이지 않는다. 모션 줄이기면 즉시 교체.
 */
export function MorphContent({
  stateKey,
  children,
  className,
}: {
  stateKey: string
  children: React.ReactNode
  className?: string
}) {
  const reduced = useReducedMotion()
  const [changed, setChanged] = React.useState(false)
  const [leaving, setLeaving] = React.useState<{ key: string; node: React.ReactNode } | null>(null)
  const lastNode = React.useRef<React.ReactNode>(children)
  const lastKey = React.useRef(stateKey)

  // 키가 바뀌면 직전에 그려진 내용을 떠나는 레이어로 남긴다(페인트 전에 실행)
  React.useLayoutEffect(() => {
    if (lastKey.current === stateKey) return
    const prevKey = lastKey.current
    lastKey.current = stateKey
    if (reduced) return
    setChanged(true)
    setLeaving({ key: prevKey, node: lastNode.current })
  }, [stateKey, reduced])
  React.useEffect(() => {
    lastNode.current = children
  })

  // animationend 가 오지 않는 경우(탭 비활성 등)를 대비한 안전장치
  React.useEffect(() => {
    if (!leaving) return
    const t = setTimeout(() => setLeaving(null), 300)
    return () => clearTimeout(t)
  }, [leaving])

  const base = "inline-flex items-center justify-center gap-1.5"
  return (
    <span className={cn("relative", base, className)}>
      {leaving && (
        <span
          key={`out-${leaving.key}`}
          aria-hidden="true"
          className={cn("morph-out pointer-events-none absolute inset-0", base, className)}
          onAnimationEnd={() => setLeaving(null)}
        >
          {leaving.node}
        </span>
      )}
      <span key={stateKey} className={cn(base, className, changed && !reduced && "morph-in")}>
        {children}
      </span>
    </span>
  )
}

type MorphButtonProps = React.ComponentProps<typeof Button> & {
  /** 내용 상태를 구분하는 키. 생략하면 문자열 children 을 쓰고, 그것도 없으면 애니메이션 없음 */
  stateKey?: string
  /** sm(640px) 이상에서 내용 폭이 바뀔 때 버튼 폭도 부드럽게 바꾼다. 모바일 w-full 은 그대로 둔다 */
  animateWidth?: boolean
  contentClassName?: string
}

function useMinSm(enabled: boolean) {
  const [matches, setMatches] = React.useState(false)
  React.useEffect(() => {
    if (!enabled) return
    const mq = window.matchMedia("(min-width: 640px)")
    const update = () => setMatches(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [enabled])
  return enabled && matches
}

/** Button + 라벨 교체 모션 + (선택) 폭 보간. type/disabled/className/onClick 등은 Button 으로 그대로 전달 */
export function MorphButton({
  stateKey,
  animateWidth = false,
  contentClassName,
  className,
  style,
  children,
  ...props
}: MorphButtonProps) {
  const reduced = useReducedMotion()
  const key = stateKey ?? (typeof children === "string" ? children : "static")
  const widthOn = useMinSm(animateWidth && !reduced)

  const btnRef = React.useRef<HTMLButtonElement | null>(null)
  const measureRef = React.useRef<HTMLSpanElement | null>(null)
  const [width, setWidth] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (!widthOn) {
      setWidth(null)
      return
    }
    const btn = btnRef.current
    const m = measureRef.current
    if (!btn || !m) return
    const measure = () => {
      const cs = getComputedStyle(btn)
      const chrome =
        parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) +
        parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)
      const next = Math.ceil(m.getBoundingClientRect().width + chrome)
      if (next > 0 && Number.isFinite(next)) setWidth(next)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(m)
    return () => ro.disconnect()
  }, [widthOn])

  const animated = widthOn && width !== null
  return (
    <Button
      {...props}
      ref={btnRef}
      className={cn("relative", className)}
      style={
        animated
          ? {
              ...style,
              width,
              transition: `width 260ms ${WIDTH_EASE}, background-color 150ms, color 150ms, box-shadow 150ms, opacity 150ms, transform 150ms`,
            }
          : style
      }
    >
      <MorphContent stateKey={key} className={contentClassName}>
        {children}
      </MorphContent>
      {widthOn && (
        <span
          ref={measureRef}
          aria-hidden="true"
          className={cn(
            "pointer-events-none invisible absolute left-0 top-0 inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
            contentClassName,
          )}
        >
          {children}
        </span>
      )}
    </Button>
  )
}
