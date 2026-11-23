"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ExpenseTeamShareEditor({ expenseId, teams, initialChoice }: {
  expenseId: string;
  teams: { id: string; name: string }[];
  initialChoice: string;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState(initialChoice);
  const [savedChoice, setSavedChoice] = useState(initialChoice);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const result = await fetch(`/api/expenses/${expenseId}/team-share`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId: choice === "private" ? null : choice }),
      });
      const payload = await result.json();
      setFailed(!result.ok);
      setMessage(result.ok ? "공유 팀을 저장했습니다." : payload.error?.message ?? "공유 팀을 저장하지 못했습니다.");
      if (result.ok) {
        setSavedChoice(choice);
        router.refresh();
      }
    } catch {
      setFailed(true);
      setMessage("공유 팀을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const autoLabel = teams.length === 1 ? `자동 · ${teams[0].name}` : "자동 · 공유 안 함";
  const requiresTeam = choice === "auto" && teams.length > 1;
  return (
    <form onSubmit={save} className="glass space-y-2 rounded-xl p-4">
      <label htmlFor="expense-share-team" className="text-sm font-semibold text-[var(--apple-label)]">비용 공유 팀</label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="expense-share-team"
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          disabled={busy}
          className="min-h-10 min-w-0 rounded-lg border border-[var(--apple-separator)] bg-[var(--apple-system-background)] px-2.5 text-sm text-[var(--apple-label)]"
        >
          <option value="auto">{autoLabel}</option>
          <option value="private">공유 안 함</option>
          {choice === "unavailable" && <option value="unavailable" disabled>기존 팀 사용 불가</option>}
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <Button type="submit" variant="outline" disabled={busy || choice === savedChoice}>{busy ? "저장 중…" : "저장"}</Button>
      </div>
      {requiresTeam && (
        <p className="text-sm text-[var(--apple-secondary-label)]">이 법인에 소속 팀이 여러 개입니다. 공유할 팀을 선택하세요.</p>
      )}
      <p role={failed ? "alert" : "status"} className={failed ? "text-sm text-[var(--apple-red)]" : "text-sm text-[var(--apple-secondary-label)]"}>
        {message}
      </p>
    </form>
  );
}
