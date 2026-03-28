import { cn } from "@/lib/utils";

/**
 * HanahOne-style "O" symbol — two open crescent arcs forming an incomplete circle.
 * Left arc: large sweep from ~11 o'clock to ~7 o'clock
 * Right arc: smaller sweep from ~1 o'clock to ~5 o'clock
 * Gaps at top-left and bottom-right.
 */
function OneSymbol({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      className={cn("inline-block size-[0.85em] align-[-0.08em]", className)}
      aria-hidden="true"
    >
      {/* Left crescent: from ~40°(top-right area) counter-clockwise to ~320°(bottom-left area) */}
      <path
        d="M38 8 A45 45 0 1 0 62 92"
        stroke="#EF3B2D"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />
      {/* Right crescent: from ~320° clockwise to ~40° */}
      <path
        d="M62 92 A45 45 0 0 0 38 8"
        stroke="#EF3B2D"
        strokeWidth="12"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * App icon — red circle symbol on white/dark rounded square
 */
function AppIcon({ size = "md" }: { size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "size-7" : "size-8";
  const svgSize = size === "sm" ? "size-4" : "size-5";
  return (
    <div
      className={cn(
        sizeClass,
        "flex items-center justify-center rounded-xl",
        "bg-gradient-to-br from-[#EF3B2D] to-[#D42B1F]",
        "shadow-[0_2px_8px_rgba(239,59,45,0.3)]"
      )}
    >
      <svg viewBox="0 0 100 100" fill="none" className={svgSize}>
        <path
          d="M38 8 A45 45 0 1 0 62 92"
          stroke="white"
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M62 92 A45 45 0 0 0 38 8"
          stroke="white"
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

/**
 * Branded "Expense One" text with the red "O" symbol.
 * Usage: <ExpenseOneLogo size="sm" /> or <ExpenseOneLogo size="lg" />
 */
export function ExpenseOneLogo({
  size = "md",
  showIcon = false,
  className,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  showIcon?: boolean;
  className?: string;
}) {
  const sizeClasses = {
    sm: "text-[15px]",
    md: "text-base",
    lg: "text-xl sm:text-[22px]",
    xl: "text-[22px]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center font-bold tracking-[-0.02em] text-[var(--apple-label)]",
        sizeClasses[size],
        showIcon && "gap-2.5",
        className
      )}
    >
      {showIcon && <AppIcon size={size === "sm" ? "sm" : "md"} />}
      <span>
        Expense
        <span className="text-[#EF3B2D]">
          <OneSymbol />
          ne
        </span>
      </span>
    </span>
  );
}
