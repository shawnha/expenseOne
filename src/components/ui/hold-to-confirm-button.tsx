"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import {
  HOLD_DEFAULT_MS,
  HOLD_RETRACT_MS,
  holdProgress,
  shouldCancelHold,
} from "@/lib/ui/hold-confirm"
import { cn } from "@/lib/utils"

type HoldToConfirmButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "onClick" | "children" | "type"
> & {
  onConfirm: () => void
  /** 채워지는 데 걸리는 시간(ms) */
  duration?: number
  /** 누르는 동안(모션 줄이기일 때) 보여줄 문구 */
  holdingLabel?: string
  /** 채움 레이어 색. 기본은 밝은 오버레이 */
  fillClassName?: string
  children: React.ReactNode
}

/**
 * 되돌리기 어려운 동작용 길게 누르기 버튼.
 * 키보드 Enter/Space 는 즉시 확정한다 — 이 버튼이 놓인 다이얼로그가 이미 의도적인 확인 단계다.
 */
export function HoldToConfirmButton({
  onConfirm,
  duration = HOLD_DEFAULT_MS,
  holdingLabel = "계속 누르세요",
  fillClassName = "bg-white/25",
  disabled,
  className,
  children,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onBlur,
  onKeyDown,
  onContextMenu,
  ...rest
}: HoldToConfirmButtonProps) {
  const reduced = useReducedMotion()
  const [holding, setHolding] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const startRef = React.useRef(0)
  const activeRef = React.useRef(false)
  const onConfirmRef = React.useRef(onConfirm)
  React.useEffect(() => {
    onConfirmRef.current = onConfirm
  })

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }

  const cancel = React.useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setHolding(false)
  }, [])

  const finish = React.useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    timerRef.current = null
    setHolding(false)
    onConfirmRef.current()
  }, [])

  // 타이머가 일찍 깨어난 경우를 대비해 진행률을 한 번 더 확인
  const tick = React.useCallback(() => {
    if (!activeRef.current) return
    const progress = holdProgress(performance.now() - startRef.current, duration)
    if (progress < 1) {
      timerRef.current = setTimeout(finish, Math.max(16, duration * (1 - progress)))
      return
    }
    finish()
  }, [duration, finish])

  // 누르는 중 disabled 가 되거나 언마운트되면 정리
  React.useEffect(() => {
    if (disabled) cancel()
  }, [disabled, cancel])
  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const showFill = holding && !reduced

  return (
    <Button
      {...rest}
      type="button"
      disabled={disabled}
      aria-busy={holding || rest["aria-busy"] ? true : undefined}
      className={cn(
        "relative touch-none overflow-hidden select-none [-webkit-touch-callout:none] active:scale-[0.97] motion-reduce:active:scale-100",
        className,
      )}
      onPointerDown={(e) => {
        onPointerDown?.(e)
        if (disabled || e.defaultPrevented) return
        if (!e.isPrimary || e.button !== 0) return
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* 캡처 실패해도 누르기는 계속 */
        }
        clearTimer()
        activeRef.current = true
        startRef.current = performance.now()
        setHolding(true)
        timerRef.current = setTimeout(tick, duration)
      }}
      onPointerMove={(e) => {
        onPointerMove?.(e)
        if (!activeRef.current) return
        const r = e.currentTarget.getBoundingClientRect()
        if (shouldCancelHold({ x: e.clientX, y: e.clientY }, r)) cancel()
      }}
      onPointerUp={(e) => {
        onPointerUp?.(e)
        cancel()
      }}
      onPointerCancel={(e) => {
        onPointerCancel?.(e)
        cancel()
      }}
      onLostPointerCapture={(e) => {
        onLostPointerCapture?.(e)
        cancel()
      }}
      onBlur={(e) => {
        onBlur?.(e)
        cancel()
      }}
      onContextMenu={(e) => {
        onContextMenu?.(e)
        // 모바일 길게 누르기가 컨텍스트 메뉴로 가로채이지 않게
        if (activeRef.current) e.preventDefault()
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        // 키 반복(꾹 누름)이 연속 확정으로 이어지지 않게 막는다
        if (e.repeat && (e.key === "Enter" || e.key === " ")) e.preventDefault()
      }}
      onClick={(e) => {
        // detail 0 = 키보드(Enter/Space)로 만들어진 클릭. 마우스·터치 클릭은 길게 누르기로만 확정한다.
        if (e.detail === 0 && !disabled && !e.defaultPrevented) onConfirmRef.current()
      }}
    >
      <span
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0 origin-left", fillClassName)}
        style={{
          transform: showFill ? "scaleX(1)" : "scaleX(0)",
          transition: showFill
            ? `transform ${duration}ms linear`
            : `transform ${HOLD_RETRACT_MS}ms ease-out`,
        }}
      />
      <span className="relative inline-flex items-center justify-center gap-1.5">
        {holding && reduced ? holdingLabel : children}
      </span>
    </Button>
  )
}
