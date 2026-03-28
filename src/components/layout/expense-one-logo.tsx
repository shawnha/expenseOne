import { cn } from "@/lib/utils";

/**
 * Original app icon — blue gradient rounded square with three lines
 */
function AppIcon({ size = "md" }: { size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "size-7" : "size-8";
  const svgSize = size === "sm" ? "size-4" : "size-5";
  return (
    <div
      className={cn(
        sizeClass,
        "flex items-center justify-center rounded-xl",
        "bg-gradient-to-br from-[#007AFF] to-[#5856D6]",
        "shadow-[0_2px_8px_rgba(0,122,255,0.3)]"
      )}
    >
      <svg viewBox="0 0 32 32" className={svgSize} fill="none">
        <rect x="8" y="10" width="16" height="2.5" rx="1.25" fill="white" />
        <rect x="8" y="14.75" width="12" height="2.5" rx="1.25" fill="white" />
        <rect x="8" y="19.5" width="16" height="2.5" rx="1.25" fill="white" />
      </svg>
    </div>
  );
}

/**
 * Branded "ExpenseOne" text — "Expense" in label color, "One" in blue.
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
        Expense<span className="text-[var(--apple-blue)]">One</span>
      </span>
    </span>
  );
}
