"use client";

import { Suspense, useEffect, useState } from "react";
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
function AdminCompanyFilterInner({ paramName = "company" }: AdminCompanyFilterProps) {
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

/**
 * useSearchParams()는 Suspense 경계 안에서만 안전하다. 경계가 없으면 이 컴포넌트가
 * 속한 페이지 subtree 전체가 하이드레이션되지 않아 useEffect가 실행되지 않는다.
 * 호출부가 기억해야 하는 조건으로 두면 또 빠뜨리므로 컴포넌트가 직접 감싼다.
 * (로딩 중에는 원래도 null을 렌더하므로 fallback도 null이 맞다.)
 */
export function AdminCompanyFilter(props: AdminCompanyFilterProps) {
  return (
    <Suspense fallback={null}>
      <AdminCompanyFilterInner {...props} />
    </Suspense>
  );
}
