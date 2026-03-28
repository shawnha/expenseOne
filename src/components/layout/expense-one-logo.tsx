import { cn } from "@/lib/utils";

/**
 * HanahOne-style "O" symbol — red crescent circle from brand C.I.
 * Rendered inline at the text's font size via `1em` sizing.
 */
function OneSymbol({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      className={cn("inline-block size-[0.75em] -ml-[0.05em] align-baseline", className)}
      aria-hidden="true"
    >
      <path
        d="M50 5 C25 5 5 25 5 50 C5 75 25 95 50 95"
        stroke="#EF3B2D"
        strokeWidth="14"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M50 5 C75 5 95 25 95 50 C95 75 75 95 50 95"
        stroke="#EF3B2D"
        strokeWidth="14"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Branded "Expense One" text with the red "O" symbol.
 * Usage: <ExpenseOneLogo size="sm" /> or <ExpenseOneLogo size="lg" />
 */
export function ExpenseOneLogo({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg" | "xl";
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
        "font-bold tracking-[-0.02em] text-[var(--apple-label)]",
        sizeClasses[size],
        className
      )}
    >
      Expense
      <span className="text-[#EF3B2D]">
        <OneSymbol />
        ne
      </span>
    </span>
  );
}
