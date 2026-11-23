"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SettlementSource, SettlementSubject } from "@/lib/validations/brand-settlement";

export function SettlementSubjectEditor({ id, source, existing, suggestedBrand, defaultMonth }: {
  id: string;
  source: SettlementSource;
  existing: SettlementSubject | null;
  suggestedBrand?: string | null;
  defaultMonth: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(existing);
  const [brandName, setBrandName] = useState(existing?.brandName ?? suggestedBrand ?? "");
  const [month, setMonth] = useState(existing?.month ?? defaultMonth);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function save(subject: SettlementSubject | null) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/brand-settlements/${source}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subject),
      });
      const result = await response.json();
      setFailed(!response.ok);
      setMessage(response.ok ? (subject ? "정산 대상을 저장했습니다." : "정산 대상에서 해제했습니다.")
        : result.error?.message ?? "정산 대상을 저장하지 못했습니다.");
      if (response.ok) {
        setSaved(subject);
        router.refresh();
      }
    } catch {
      setFailed(true);
      setMessage("정산 대상을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save({ brandName: brandName.trim(), month });
  }

  return (
    <details className="glass group rounded-xl">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-[var(--apple-label)] [&::-webkit-details-marker]:hidden">
        <span>브랜드 정산 {saved && <span className="font-normal text-[var(--apple-secondary-label)]">· {saved.brandName} · {saved.month}</span>}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <form onSubmit={submit} className="flex flex-col gap-3 border-t border-[var(--apple-separator)] p-4">
        <p className="text-sm text-[var(--apple-secondary-label)]">등록하면 이 법인의 정산 조회 권한이 있는 사람이 요약을 볼 수 있습니다.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm text-[var(--apple-label)]">
            브랜드명
            <Input required maxLength={100} value={brandName} disabled={busy} onChange={(event) => setBrandName(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm text-[var(--apple-label)]">
            정산월
            <Input type="month" required value={month} disabled={busy} onChange={(event) => setMonth(event.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || !brandName.trim() || !month}>{busy ? "저장 중…" : saved ? "정산 대상 수정" : "정산 대상 등록"}</Button>
          {saved && <Button type="button" variant="outline" disabled={busy} onClick={() => void save(null)}>등록 해제</Button>}
        </div>
        <p role={failed ? "alert" : "status"} className={failed ? "text-sm text-[var(--apple-red)]" : "text-sm text-[var(--apple-secondary-label)]"}>
          {message}
        </p>
      </form>
    </details>
  );
}
