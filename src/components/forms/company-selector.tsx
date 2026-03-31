"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface CompanySelectorProps {
  value: string;
  onChange: (companyId: string) => void;
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
          (c: { id: string; name: string; slug: string }) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
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

  const showHint = value && userCompanyId && value !== userCompanyId;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "inline-flex self-start p-1 rounded-full",
          "bg-[var(--apple-system-grouped-background)]",
          "border border-[var(--glass-border)]"
        )}
        role="radiogroup"
        aria-label="회사 선택"
      >
        {companies.map((company) => {
          const isSelected = value === company.id;
          return (
            <button
              key={company.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(company.id)}
              className={cn(
                "relative px-4 py-1.5 text-[13px] font-medium rounded-full transition-all duration-200 whitespace-nowrap",
                isSelected
                  ? "bg-[var(--apple-blue)] text-white shadow-[0_2px_8px_rgba(0,122,255,0.25)]"
                  : "text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]"
              )}
            >
              {company.name}
            </button>
          );
        })}
      </div>
      {showHint && (
        <p className="text-[12px] text-[var(--apple-secondary-label)] ml-1">
          소속 외 회사가 선택되었습니다
        </p>
      )}
    </div>
  );
}
