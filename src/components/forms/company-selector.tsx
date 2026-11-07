"use client";

import { useEffect, useMemo, useState } from "react";
import { CompanyPillGroup } from "@/components/companies/company-pill-group";
import { OcrNotice } from "@/components/forms/ocr-suggestion";
import { matchDocumentCompanies, type DocumentCompany } from "@/lib/ocr/company";
import type { OcrFields } from "@/lib/ocr/types";

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
  documentFields?: OcrFields[];
  allowDocumentAutoSelect?: boolean;
  documentSelectionLocked?: boolean;
  onDocumentCompanyChange?: (companyId: string) => void;
  onDocumentCompanyCheckChange?: (busy: boolean) => void;
}

export function CompanySelector({
  value,
  onChange,
  userCompanyId,
  initialCompanies,
  documentFields,
  allowDocumentAutoSelect = false,
  documentSelectionLocked = false,
  onDocumentCompanyChange,
  onDocumentCompanyCheckChange,
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

  const [identities, setIdentities] = useState<DocumentCompany[] | null>(null);
  const [identityError, setIdentityError] = useState(false);
  const hasDocuments = !!documentFields?.length;
  useEffect(() => {
    if (!hasDocuments) return;
    let cancelled = false;
    onDocumentCompanyCheckChange?.(true);
    fetch("/api/companies/document-identities")
      .then(async (res) => {
        if (!res.ok) throw new Error("Company identities unavailable");
        const json = await res.json();
        if (!Array.isArray(json.data)) throw new Error("Invalid company identities");
        if (!cancelled) {
          setIdentities(json.data);
          setIdentityError(false);
        }
      })
      .catch(() => { if (!cancelled) setIdentityError(true); })
      .finally(() => { if (!cancelled) onDocumentCompanyCheckChange?.(false); });
    return () => { cancelled = true; onDocumentCompanyCheckChange?.(false); };
  }, [hasDocuments, onDocumentCompanyCheckChange]);
  const match = useMemo(() => matchDocumentCompanies(
    documentFields ?? [],
    (identities ?? []).filter((c) => companies.some((option) => option.id === c.id)),
  ), [documentFields, identities, companies]);

  useEffect(() => {
    if (!identities || match.kind !== "match" || !match.automatic || !allowDocumentAutoSelect || documentSelectionLocked || value === match.company.id) return;
    if (onDocumentCompanyChange) onDocumentCompanyChange(match.company.id);
  }, [match, identities, allowDocumentAutoSelect, documentSelectionLocked, value, onDocumentCompanyChange]);

  // Render nothing while loading, or if 0–1 companies
  if (loading || companies.length === 0 || (companies.length <= 1 && !hasDocuments)) return null;

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
      {hasDocuments && identities && match.kind !== "none" && (
        <div aria-live="polite">
          {match.kind === "conflict" ? <OcrNotice tone="warn">{match.message}</OcrNotice> : (
            <OcrNotice tone={value === match.company.id ? "info" : "warn"}>
              <span className="block break-words">
                서류의 수신 법인: <strong>{match.company.name}</strong>
                {match.by === "businessNumber" && match.company.businessNumber ? ` · 사업자번호 ${match.company.businessNumber.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3")}` : " · 회사명 일치"}
                {value === match.company.id ? " — 선택한 회사와 일치합니다." : " — 선택한 회사와 다릅니다."}
              </span>
              {value !== match.company.id && (documentSelectionLocked ? (
                <span className="mt-1 block">카드에 지정된 법인 또는 제출 확인 중인 값은 자동 변경하지 않습니다. 회사와 원본 서류를 확인해주세요.</span>
              ) : (
                <button type="button" className="mt-1 min-h-11 rounded-lg px-2 font-semibold text-[var(--apple-blue)] focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => onDocumentCompanyChange?.(match.company.id)}>
                  {match.company.name}로 변경
                </button>
              ))}
            </OcrNotice>
          )}
        </div>
      )}
      {hasDocuments && identityError && <OcrNotice tone="warn">법인 대조 정보를 불러오지 못했습니다. 서류의 수신 회사와 선택한 회사를 직접 확인해주세요.</OcrNotice>}
      {showHint && (
        <p className="text-footnote text-[var(--apple-orange)] font-medium ml-1">
          소속 외 회사가 선택되었습니다
        </p>
      )}
    </div>
  );
}
