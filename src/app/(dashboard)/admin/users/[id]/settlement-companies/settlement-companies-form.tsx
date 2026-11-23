"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

export function SettlementCompaniesForm({ userId, companies, selectedIds, assignLeader = false, onSaved }: {
  userId: string;
  companies: { id: string; name: string }[];
  selectedIds: string[];
  assignLeader?: boolean;
  onSaved?: (companyIds: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const companyIds = new FormData(event.currentTarget).getAll("company").map(String);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${userId}/settlement-companies`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds, accessRole: assignLeader ? "LEADER" : undefined }),
      });
      const result = await response.json();
      setFailed(!response.ok);
      setMessage(response.ok ? "조회 법인을 저장했습니다." : result.error?.message ?? "조회 법인을 저장하지 못했습니다.");
      if (response.ok) onSaved?.(companyIds);
    } catch {
      setFailed(true);
      setMessage("조회 법인을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <fieldset disabled={busy} className="glass rounded-xl px-4 py-2">
        <legend className="sr-only">조회 법인</legend>
        {companies.map((company) => (
          <label key={company.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[var(--apple-label)]">
            <input type="checkbox" name="company" value={company.id} defaultChecked={selectedIds.includes(company.id)}
              className="size-4 accent-[var(--apple-blue)]" />
            {company.name}
          </label>
        ))}
        {companies.length === 0 && <p className="py-2 text-sm text-[var(--apple-secondary-label)]">등록된 활성 법인이 없습니다.</p>}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>{busy ? "저장 중…" : "조회 법인 저장"}</Button>
        <p role={failed ? "alert" : "status"} className={failed ? "text-sm text-[var(--apple-red)]" : "text-sm text-[var(--apple-secondary-label)]"}>
          {message}
        </p>
      </div>
    </form>
  );
}
