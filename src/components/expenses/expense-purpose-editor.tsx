"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EXPENSE_PURPOSES, expensePurposeSchema, type ExpensePurpose } from "@/lib/admin/expense-purpose";

export function ExpensePurposeEditor({ expenseId, initialPurpose }: {
  expenseId: string;
  initialPurpose: ExpensePurpose | null;
}) {
  const id = useId();
  const router = useRouter();
  const [purpose, setPurpose] = useState(initialPurpose ?? "");
  const [saved, setSaved] = useState(initialPurpose ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    try {
      setSaving(true);
      setMessage("");
      const response = await fetch(`/api/expenses/${expenseId}/purpose`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: purpose ? expensePurposeSchema.parse(purpose) : null }),
      });
      if (!response.ok) throw new Error();
      setSaved(purpose);
      setMessage("저장했습니다.");
      router.refresh();
    } catch {
      setMessage("저장하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label htmlFor={id} className="text-footnote text-[var(--apple-secondary-label)]">비용 성격</label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <select id={id} value={purpose} disabled={saving} onChange={(event) => {
          setPurpose(event.target.value);
          setMessage("");
        }} className="min-h-11 w-full max-w-48 rounded-lg border border-[var(--apple-separator)] bg-[var(--apple-system-background)] px-2 text-sm text-[var(--apple-label)] sm:w-auto">
          <option value="">미분류</option>
          {Object.entries(EXPENSE_PURPOSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <Button type="button" size="lg" variant="outline" disabled={saving || purpose === saved} onClick={() => void save()}>
          {saving ? "저장 중…" : "저장"}
        </Button>
      </div>
      {message && <p className="mt-1 text-footnote text-[var(--apple-secondary-label)]" role="status">{message}</p>}
    </div>
  );
}
