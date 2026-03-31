import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="경로"
      className="hidden sm:flex items-center gap-1 text-footnote text-[var(--apple-tertiary-label)]"
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3" aria-hidden="true" />}
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-[var(--apple-label)] transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-[var(--apple-secondary-label)] font-medium">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
