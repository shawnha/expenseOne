"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CompanyPillGroup } from "@/components/companies/company-pill-group";

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
    <CompanyPillGroup
      options={options.map((o) => ({ key: o.slug, label: o.name }))}
      value={currentSlug}
      onChange={handleChange}
      ariaLabel="회사 필터"
    />
  );
}
