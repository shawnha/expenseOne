"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface CompanyOption {
  id: string;
  name: string;
  slug: string;
}

interface AdminCompanyFilterProps {
  paramName?: string;
}

/**
 * Segmented control for filtering by company in admin pages (server components).
 * Reads/writes URL search params to trigger server re-render.
 */
export function AdminCompanyFilter({ paramName = "company" }: AdminCompanyFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentSlug = searchParams.get(paramName) ?? "";

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchCompanies() {
      try {
        const res = await fetch("/api/companies");
        if (!res.ok) throw new Error("Failed");
        const json = await res.json();
        const data: CompanyOption[] = (json.data ?? []).map(
          (c: { id: string; name: string; slug: string }) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
          }),
        );
        if (!cancelled) setCompanies(data);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCompanies();
    return () => { cancelled = true; };
  }, []);

  if (loading || companies.length <= 1) return null;

  const options = [{ slug: "", name: "전체" }, ...companies];

  function handleChange(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) {
      params.set(paramName, slug);
    } else {
      params.delete(paramName);
    }
    // Reset page to 1 when changing company filter
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div
      className={cn(
        "inline-flex p-1 rounded-xl",
        "bg-[var(--apple-system-grouped-background)]",
        "border border-[var(--glass-border)]",
      )}
      role="radiogroup"
      aria-label="회사 필터"
    >
      {options.map((opt) => {
        const isSelected = currentSlug === opt.slug;
        return (
          <button
            key={opt.slug}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => handleChange(opt.slug)}
            className={cn(
              "relative px-4 py-1.5 text-[13px] font-medium rounded-[10px] transition-all duration-200 whitespace-nowrap",
              isSelected
                ? "bg-[var(--apple-blue)] text-white shadow-[0_2px_8px_rgba(0,122,255,0.25)]"
                : "text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]",
            )}
          >
            {opt.name}
          </button>
        );
      })}
    </div>
  );
}
