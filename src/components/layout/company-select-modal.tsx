"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Company {
  id: string;
  name: string;
  slug: string;
}

export function CompanySelectModal() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
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
          // Auto-select if only one company
          if (data.length === 1) {
            setSelectedId(data[0].id);
          }
        }
      } catch {
        // silently ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchCompanies();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (!selectedId) {
      toast.error("소속 회사를 선택해주세요.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: selectedId }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error?.message || "저장에 실패했습니다.");
      }

      toast.success("소속 회사가 저장되었습니다!");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "저장에 실패했습니다."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="glass border-0 ring-1 ring-white/20 shadow-2xl w-full max-w-sm rounded-2xl p-6 space-y-5">
        <div className="text-center">
          <h2 className="text-lg font-bold text-[var(--apple-label)]">
            소속 회사 선택
          </h2>
          <p className="text-sm text-[var(--apple-secondary-label)] mt-1">
            서비스 이용을 위해 소속 회사를 선택해주세요.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="size-6 animate-spin text-[var(--apple-secondary-label)]" />
          </div>
        ) : companies.length === 0 ? (
          <p className="text-sm text-center text-[var(--apple-secondary-label)] py-4">
            등록된 회사가 없습니다. 관리자에게 문의해주세요.
          </p>
        ) : (
          <div
            className={cn(
              "inline-flex w-full p-1 rounded-xl",
              "bg-[var(--apple-system-grouped-background)]",
              "border border-[var(--glass-border)]"
            )}
            role="radiogroup"
            aria-label="회사 선택"
          >
            {companies.map((company) => {
              const isSelected = selectedId === company.id;
              return (
                <button
                  key={company.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedId(company.id)}
                  className={cn(
                    "flex-1 px-4 py-2 text-[13px] font-medium rounded-[10px] transition-all duration-200 whitespace-nowrap",
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
        )}

        <Button
          onClick={handleSave}
          disabled={saving || !selectedId || loading}
          className="w-full rounded-full h-11 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)]"
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              저장 중...
            </>
          ) : (
            "저장"
          )}
        </Button>
      </div>
    </div>
  );
}
