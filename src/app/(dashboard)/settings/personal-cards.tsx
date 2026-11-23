"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PersonalCardNumber } from "@/services/personal-card.service";

export function PersonalCards({ companies, preferredCompany }: {
  companies: { id: string; name: string }[];
  preferredCompany: string;
}) {
  const [cards, setCards] = useState<PersonalCardNumber[]>([]);
  const [editor, setEditor] = useState<(Omit<PersonalCardNumber, "id"> & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/profile/cards", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setCards((await response.json()).data ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailed(true);
          setMessage("등록한 카드를 불러오지 못했습니다.");
        }
      });
    return () => controller.abort();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile/cards", {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editor),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "카드 번호를 저장하지 못했습니다.");
      const saved = result.data as PersonalCardNumber;
      setCards((current) => editor.id ? current.map((card) => card.id === editor.id ? saved : card) : [...current, saved]);
      setEditor(null);
      setFailed(false);
      setMessage("카드 번호를 저장했습니다.");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "카드 번호를 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="personal-card-label" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id="personal-card-label" className="text-sm font-semibold">비용 제출용 카드 번호</h4>
        <Button variant="outline" size="sm" disabled={busy || companies.length === 0}
          onClick={() => { setMessage(""); setEditor({ companyId: preferredCompany || companies[0]?.id, lastFour: "" }); }}>
          <Plus aria-hidden="true" />카드 추가
        </Button>
      </div>
      {cards.length > 0 && (
        <ul className="divide-y divide-[var(--apple-separator)]">
          {cards.map((card) => (
            <li key={card.id} className="flex min-h-10 items-center gap-2 py-1">
              <span className="min-w-0 flex-1 break-words text-sm">
                {companies.find((company) => company.id === card.companyId)?.name ?? "이전 법인"} · <span className="tabular-nums">•••• {card.lastFour}</span>
              </span>
              <Button variant="ghost" size="icon-sm" aria-label={`${card.lastFour} 카드 수정`} disabled={busy} onClick={() => { setMessage(""); setEditor(card); }}>
                <Pencil aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editor && (
        <form onSubmit={save} className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            사용 법인
            <select required aria-label="사용 법인" value={editor.companyId} onChange={(event) => setEditor({ ...editor, companyId: event.target.value })}
              disabled={busy} className="h-10 min-w-0 appearance-none rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 text-sm">
              <option value="">선택</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            카드 끝 4자리
            <Input value={editor.lastFour} inputMode="numeric" autoComplete="off" maxLength={4} required
              pattern="[0-9]{4}" disabled={busy}
              onChange={(event) => setEditor({ ...editor, lastFour: event.target.value.replace(/\D/g, "") })} />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={busy || !editor.companyId || editor.lastFour.length !== 4}>저장</Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setEditor(null); setMessage(""); }}>취소</Button>
          </div>
        </form>
      )}
      <p role={failed ? "alert" : "status"} className="text-xs text-[var(--apple-secondary-label)]">{message}</p>
    </section>
  );
}
