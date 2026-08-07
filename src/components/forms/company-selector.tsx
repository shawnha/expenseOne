"use client";

import { useEffect, useState } from "react";
import { CompanyPillGroup } from "@/components/companies/company-pill-group";

interface Company {
  id: string;
  name: string;
  slug: string;
  currency: string;
}

interface CompanySelectorProps {
  value: string;
  onChange: (companyId: string, currency: string) => void;
  userCompanyId?: string | null;
  initialCompanies?: Company[];
}

export function CompanySelector({
  value,
  onChange,
  userCompanyId,
  initialCompanies,
}: CompanySelectorProps) {
  const [companies, setCompanies] = useState<Company[]>(initialCompanies ?? []);
  const [loading, setLoading] = useState(!initialCompanies);

  useEffect(() => {
    // 서버에서 이미 받아온 경우 fetch 불필요
    if (initialCompanies) return;

    let cancelled = false;

    async function fetchCompanies() {
      try {
        const res = await fetch("/api/companies");
        if (!res.ok) throw new Error("Failed to fetch companies");
        const json = await res.json();
        const data: Company[] = (json.data ?? []).map(
          (c: { id: string; name: string; slug: string; currency?: string }) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            currency: c.currency ?? "KRW",
          })
        );
        if (!cancelled) {
          setCompanies(data);
        }
      } catch {
        // silently ignore — component renders nothing on error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCompanies();
    return () => {
      cancelled = true;
    };
  }, [initialCompanies]);

  // Render nothing while loading, or if 0–1 companies
  if (loading || companies.length <= 1) return null;

  // 소속과 무관하게 모든 활성 회사를 선택할 수 있다. 소속 외 회사를 고르면
  // 아래 주황색 힌트로 경고하고, 서버(createExpense)가 활성 회사인지 검증한다.
  const showHint = value && userCompanyId && value !== userCompanyId;

  return (
    <div className="flex flex-col gap-1.5">
      <CompanyPillGroup
        options={companies.map((c) => ({ key: c.id, label: c.name }))}
        value={value ?? ""}
        onChange={(id) => {
          const company = companies.find((c) => c.id === id);
          if (company) onChange(company.id, company.currency);
        }}
        ariaLabel="회사 선택"
        selectedTone={showHint ? "orange" : "blue"}
      />
      {showHint && (
        <p className="text-footnote text-[var(--apple-orange)] font-medium ml-1">
          소속 외 회사가 선택되었습니다
        </p>
      )}
    </div>
  );
}
