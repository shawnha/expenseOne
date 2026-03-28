"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Context: ensures only one row is open at a time
// ---------------------------------------------------------------------------

interface SwipeableGroupContextValue {
  /** Currently open row id (null = all closed) */
  openId: string | null;
  /** Request to open a specific row */
  requestOpen: (id: string) => void;
  /** Request to close a specific row (only if it is the currently open one) */
  requestClose: (id: string) => void;
}

const SwipeableGroupContext = createContext<SwipeableGroupContextValue>({
  openId: null,
  requestOpen: () => {},
  requestClose: () => {},
});

/**
 * Wrap a list of `<SwipeableRow>` components in this provider so that
 * only one row can be open (swiped) at a time.
 */
export function SwipeableGroup({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);

  const requestOpen = useCallback((id: string) => {
    setOpenId(id);
  }, []);

  const requestClose = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : prev));
  }, []);

  return (
    <SwipeableGroupContext.Provider value={{ openId, requestOpen, requestClose }}>
      {children}
    </SwipeableGroupContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// SwipeAction type
// ---------------------------------------------------------------------------

export interface SwipeAction {
  /** Unique key */
  key: string;
  /** Icon element (e.g. lucide-react icon) */
  icon: ReactNode;
  /** Label text shown below icon */
  label: string;
  /** Background colour of the action button */
  color: string;
  /** Active/pressed background colour */
  activeColor?: string;
  /** Callback when the action is tapped */
  onAction: () => void;
  /** If true, requires a second tap to confirm (button text changes) */
  requireConfirm?: boolean;
  /** Confirm label (default: "확인?") */
  confirmLabel?: string;
}

// ---------------------------------------------------------------------------
// SwipeableRow
// ---------------------------------------------------------------------------

interface SwipeableRowProps {
  /** Unique identifier for this row (used by SwipeableGroup) */
  id: string;
  /** The visible list-item content */
  children: ReactNode;
  /** Action buttons revealed on left-swipe (appear from the right) */
  actions: SwipeAction[];
  /** Called when the user taps the row content (and it is not swiping) */
  onTap?: () => void;
  /** Additional class name for the outer wrapper */
  className?: string;
  /** Whether swiping is enabled (default true) */
  enabled?: boolean;
}

const ACTION_BTN_SIZE = 56; // px – iOS Notes style square button
const ACTION_GAP = 8; // px gap between buttons
const ACTION_PADDING = 12; // px padding on left/right of action area
const LOCK_THRESHOLD = 10; // px movement before locking direction
const SPRING = "transform 0.38s cubic-bezier(0.25, 0.8, 0.25, 1.05)";
const EASE = "transform 0.28s cubic-bezier(0.25, 0.1, 0.25, 1)";

export function SwipeableRow({
  id,
  children,
  actions,
  onTap,
  className,
  enabled = true,
}: SwipeableRowProps) {
  const { openId, requestOpen, requestClose } = useContext(SwipeableGroupContext);
  const isOpen = openId === id;

  const contentRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const swipingRef = useRef(false);
  const gestureLockRef = useRef<"horizontal" | "vertical" | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const totalActionsWidth =
    actions.length * ACTION_BTN_SIZE +
    (actions.length - 1) * ACTION_GAP +
    ACTION_PADDING * 2;

  // Keep isOpen in a ref so touch handlers can read it without re-attaching
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // -----------------------------------------------------------------------
  // Transform helpers
  // -----------------------------------------------------------------------
  const applyTransform = useCallback((x: number, transition?: string) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transform = `translateX(${x}px)`;
    el.style.transition = transition ?? "none";
  }, []);

  // -----------------------------------------------------------------------
  // Close this row (animated)
  // -----------------------------------------------------------------------
  const close = useCallback(() => {
    requestClose(id);
    setConfirmKey(null);
    applyTransform(0, EASE);
  }, [id, requestClose, applyTransform]);

  // -----------------------------------------------------------------------
  // Respond to external close (another row opened)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen && contentRef.current) {
      applyTransform(0, EASE);
      setConfirmKey(null);
    }
  }, [isOpen, applyTransform]);

  // -----------------------------------------------------------------------
  // Touch event listeners (non-passive so we can preventDefault on horizontal)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current || actions.length === 0) return;
      startXRef.current = e.touches[0].clientX;
      startYRef.current = e.touches[0].clientY;
      currentXRef.current = isOpenRef.current ? -totalActionsWidth : 0;
      swipingRef.current = false;
      gestureLockRef.current = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!enabledRef.current || actions.length === 0) return;

      const dx = e.touches[0].clientX - startXRef.current;
      const dy = e.touches[0].clientY - startYRef.current;
      const absDX = Math.abs(dx);
      const absDY = Math.abs(dy);

      // Decide gesture direction
      if (gestureLockRef.current === null) {
        if (absDX < LOCK_THRESHOLD && absDY < LOCK_THRESHOLD) return;

        // If row is closed and user swipes RIGHT (dx > 0), don't capture —
        // let the browser handle it (iOS back gesture, etc.)
        if (!isOpenRef.current && dx > 0) {
          gestureLockRef.current = "vertical"; // treat as non-ours
          return;
        }

        gestureLockRef.current = absDX > absDY * 1.4 ? "horizontal" : "vertical";
      }

      if (gestureLockRef.current === "vertical") return;

      e.preventDefault(); // lock horizontal

      const base = isOpenRef.current ? -totalActionsWidth : 0;
      const totalX = dx + base;

      swipingRef.current = true;
      // Clamp: can't swipe right past 0, can't swipe left past totalActionsWidth
      // Add rubber-band resistance past limits
      let clampedX: number;
      if (totalX > 0) {
        // Right of origin -- rubber band
        clampedX = totalX * 0.2;
      } else if (totalX < -totalActionsWidth) {
        // Past full open -- rubber band
        const over = totalX + totalActionsWidth;
        clampedX = -totalActionsWidth + over * 0.2;
      } else {
        clampedX = totalX;
      }
      currentXRef.current = clampedX;
      applyTransform(clampedX);
    };

    const onTouchEnd = () => {
      if (!enabledRef.current || actions.length === 0) return;
      if (gestureLockRef.current !== "horizontal") {
        gestureLockRef.current = null;
        swipingRef.current = false;
        return;
      }
      gestureLockRef.current = null;

      const x = currentXRef.current;
      const threshold = totalActionsWidth * 0.35;

      if (x < -threshold) {
        // Open
        requestOpen(id);
        applyTransform(-totalActionsWidth, SPRING);
      } else {
        // Close
        requestClose(id);
        applyTransform(0, SPRING);
        setConfirmKey(null);
      }

      // Reset swiping flag after animation
      setTimeout(() => {
        swipingRef.current = false;
      }, 50);
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      clearTimeout(confirmTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions.length, totalActionsWidth, id, requestOpen, requestClose, applyTransform]);

  // -----------------------------------------------------------------------
  // Tap handler
  // -----------------------------------------------------------------------
  const handleContentClick = useCallback(() => {
    if (swipingRef.current) return;
    if (isOpen) {
      close();
      return;
    }
    onTap?.();
  }, [isOpen, close, onTap]);

  // -----------------------------------------------------------------------
  // Action button handler (with optional confirm)
  // -----------------------------------------------------------------------
  const handleAction = useCallback(
    (action: SwipeAction) => {
      if (action.requireConfirm && confirmKey !== action.key) {
        setConfirmKey(action.key);
        clearTimeout(confirmTimeoutRef.current);
        confirmTimeoutRef.current = setTimeout(() => {
          setConfirmKey(null);
        }, 3500);
        return;
      }
      clearTimeout(confirmTimeoutRef.current);
      setConfirmKey(null);
      action.onAction();
    },
    [confirmKey],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ contain: "layout" }}
    >
      {/* Action buttons behind the content – iOS Notes rounded square style */}
      {actions.length > 0 && (
        <div
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-[var(--apple-system-background)] dark:bg-[var(--apple-system-background)]"
          style={{
            width: totalActionsWidth,
            paddingLeft: ACTION_PADDING,
            paddingRight: ACTION_PADDING,
            gap: ACTION_GAP,
          }}
          aria-hidden={!isOpen}
        >
          {actions.map((action) => {
            const isConfirming = confirmKey === action.key;
            return (
              <button
                key={action.key}
                type="button"
                onClick={() => handleAction(action)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 text-white",
                  "rounded-2xl transition-all duration-150",
                  "active:scale-90 active:opacity-80",
                  "shadow-sm"
                )}
                style={{
                  width: ACTION_BTN_SIZE,
                  height: ACTION_BTN_SIZE,
                  backgroundColor: isConfirming
                    ? (action.activeColor ?? action.color)
                    : action.color,
                }}
                aria-label={isConfirming ? (action.confirmLabel ?? "확인?") : action.label}
              >
                <span className="flex items-center justify-center size-[22px]">
                  {action.icon}
                </span>
                <span className="text-[10px] font-semibold leading-none tracking-tight">
                  {isConfirming ? (action.confirmLabel ?? "확인?") : action.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Foreground content */}
      <div
        ref={contentRef}
        onClick={handleContentClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleContentClick();
          }
        }}
        tabIndex={0}
        className="relative select-none bg-inherit"
        style={{ willChange: "transform" }}
        role="button"
      >
        {children}
      </div>
    </div>
  );
}
