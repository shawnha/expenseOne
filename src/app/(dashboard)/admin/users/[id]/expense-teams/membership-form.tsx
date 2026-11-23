"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";

interface TeamOption {
  id: string;
  name: string;
  companyName: string;
}

export function ExpenseTeamMembershipForm({ userId, options, selectedIds }: {
  userId: string;
  options: TeamOption[];
  selectedIds: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const departmentIds = new FormData(event.currentTarget).getAll("team");
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${userId}/expense-teams`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentIds }),
      });
      const result = await response.json();
      setFailed(!response.ok);
      setMessage(response.ok ? "팀을 저장했습니다." : result.error?.message ?? "팀을 저장하지 못했습니다.");
    } catch {
      setFailed(true);
      setMessage("팀을 저장하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  if (options.length === 0) {
    return <p className="text-sm text-[var(--apple-secondary-label)]">관리자 부서 관리에서 먼저 팀을 등록해 주세요.</p>;
  }

  const companies = new Map<string, TeamOption[]>();
  for (const option of options) {
    const teams = companies.get(option.companyName) ?? [];
    teams.push(option);
    companies.set(option.companyName, teams);
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {[...companies].map(([company, teams]) => (
        <fieldset key={company} disabled={busy} className="glass px-4 pb-2">
          <legend className="px-1 text-sm font-semibold text-[var(--apple-label)]">{company}</legend>
          {teams.map((team) => (
            <label key={team.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[var(--apple-label)]">
              <input
                type="checkbox"
                name="team"
                value={team.id}
                defaultChecked={selectedIds.includes(team.id)}
                className="size-4 accent-[var(--apple-blue)]"
              />
              {team.name}
            </label>
          ))}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>{busy ? "저장 중…" : "팀 저장"}</Button>
        <p role={failed ? "alert" : "status"} className={failed ? "text-sm text-[var(--apple-red)]" : "text-sm text-[var(--apple-secondary-label)]"}>
          {message}
        </p>
      </div>
    </form>
  );
}
