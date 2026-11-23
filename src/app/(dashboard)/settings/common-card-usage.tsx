"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { getCommonCardsForUser } from "@/services/common-card-usage.service";

type Data = Awaited<ReturnType<typeof getCommonCardsForUser>>;
type Editor = { id?: string; mappingId: string; startedOn: string; endedOn: string };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

export function CommonCardUsage() {
  const [data, setData] = useState<Data>({ usage: [], cards: [] });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/profile/common-card-usage", { signal });
    if (!response.ok) throw new Error("공용 카드 기록을 불러오지 못했습니다.");
    setData((await response.json()).data);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch(() => {
      if (!controller.signal.aborted) {
        setFailed(true);
        setMessage("공용 카드 기록을 불러오지 못했습니다.");
      }
    });
    return () => controller.abort();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const payload = editor.id ? { id: editor.id, endedOn: editor.endedOn }
        : { mappingId: editor.mappingId, startedOn: editor.startedOn, endedOn: editor.endedOn || null };
      const response = await fetch("/api/profile/common-card-usage", {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "사용 기간을 저장하지 못했습니다.");
      setEditor(null);
      setFailed(false);
      setMessage("사용 기간을 저장했습니다.");
      await load();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "사용 기간을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">공용 카드 사용 기간</h4>
        <Button size="sm" variant="outline" disabled={busy || data.cards.length === 0}
          onClick={() => { setMessage(""); setEditor({ mappingId: "", startedOn: today(), endedOn: "" }); }}>
          사용 등록
        </Button>
      </div>
      <p className="text-xs text-[var(--apple-secondary-label)]">등록한 사용 기간은 관리자에게 공유됩니다.</p>
      {data.cards.length === 0 && (
        <p className="text-xs text-[var(--apple-secondary-label)]">선택할 수 있는 공용 카드가 없습니다.</p>
      )}
      {data.usage.length > 0 && (
        <ul className="divide-y divide-[var(--apple-separator)]">
          {data.usage.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{entry.companyName ?? "이전 법인"} · •••• {entry.lastFour}</p>
                <p className="text-xs tabular-nums text-[var(--apple-secondary-label)]">{entry.startedOn} ~ {entry.endedOn ?? "사용 중"}</p>
              </div>
              {!entry.endedOn && (
                <Button size="sm" variant="ghost" disabled={busy}
                  onClick={() => { setMessage(""); setEditor({ id: entry.id, mappingId: "", startedOn: entry.startedOn, endedOn: today() }); }}>
                  사용 종료
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editor && (
        <form onSubmit={save} className="grid gap-2 sm:grid-cols-2">
          {!editor.id && (
            <>
              <label className="grid gap-1 text-sm sm:col-span-2">
                공용 카드
                <select required aria-label="공용 카드" value={editor.mappingId} onChange={(event) => setEditor({ ...editor, mappingId: event.target.value })}
                  className="h-10 min-w-0 appearance-none rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 text-sm">
                  <option value="">카드 선택</option>
                  {data.cards.map((card) => <option key={card.id} value={card.id}>{card.companyName} · •••• {card.lastFour}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                시작일
                <Input type="date" required max={today()} value={editor.startedOn}
                  onChange={(event) => setEditor({ ...editor, startedOn: event.target.value })} />
              </label>
            </>
          )}
          <label className="grid gap-1 text-sm">
            {editor.id ? "종료일" : "종료일 (선택)"}
            <Input type="date" required={!!editor.id} min={editor.startedOn} max={today()} value={editor.endedOn}
              onChange={(event) => setEditor({ ...editor, endedOn: event.target.value })} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" type="submit" disabled={busy}>{busy ? "저장 중…" : "사용 기간 저장"}</Button>
            <Button size="sm" type="button" variant="ghost" disabled={busy} onClick={() => { setEditor(null); setMessage(""); }}>취소</Button>
          </div>
        </form>
      )}
      <p role={failed ? "alert" : "status"} className="text-xs text-[var(--apple-secondary-label)]">{message}</p>
    </section>
  );
}
