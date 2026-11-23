import Link from "next/link";
import { cn } from "@/lib/utils";

export function ExpenseScopeNav({ current }: { current: "mine" | "team" }) {
  const entries = [
    { id: "mine", href: "/expenses", label: "내 비용" },
    { id: "team", href: "/expenses/team", label: "팀 비용" },
  ];

  return (
    <nav aria-label="비용 조회 범위" className="flex gap-1 self-start rounded-full border border-[var(--apple-separator)] p-1">
      {entries.map(({ id, href, label }) => (
        <Link
          key={id}
          href={href}
          prefetch={false}
          aria-current={current === id ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium",
            current === id
              ? "bg-[var(--apple-blue)] text-white"
              : "text-[var(--apple-secondary-label)] hover:bg-[var(--apple-fill)]",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
