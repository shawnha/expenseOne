"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppUser {
  id: string;
  name: string;
  email: string;
}

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface CardMapping {
  id: string;
  cardLastFour: string;
  cardAlias: string | null;
  issuer: string | null;
  userId: string | null;
  companyId: string | null;
  isActive: boolean;
  userName: string | null;
  userEmail: string | null;
}

interface GowidCardMappingsProps {
  appUsers: AppUser[];
  companies: Company[];
}

// Curated list shown in the issuer dropdown. Anything else that came in via
// GoWid (or that the admin types in the future) still renders fine — it just
// joins the "기타" group.
const ISSUER_OPTIONS = [
  "롯데",
  "우리",
  "신한",
  "국민",
  "하나",
  "현대",
  "삼성",
  "BC",
  "NH",
];

const UNGROUPED_KEY = "__ungrouped__";

export function GowidCardMappings({ appUsers, companies }: GowidCardMappingsProps) {
  const [mappings, setMappings] = useState<CardMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchMappings = useCallback(async () => {
    try {
      const res = await fetch("/api/gowid/card-mappings");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setMappings(json.data ?? []);
    } catch {
      toast.error("카드 매핑 정보를 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMappings();
  }, [fetchMappings]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/gowid/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "동기화 실패");
      toast.success(
        `동기화 완료: ${json.newStaged}건 새로 등록, ${json.notified}건 알림 발송`,
      );
      fetchMappings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "동기화 실패");
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdate = async (
    mappingId: string,
    field: "userId" | "companyId" | "issuer",
    value: string | null,
  ) => {
    setUpdatingId(mappingId);
    try {
      const res = await fetch("/api/gowid/card-mappings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappingId, [field]: value }),
      });
      if (!res.ok) throw new Error("업데이트 실패");
      toast.success("업데이트되었습니다.");
      fetchMappings();
    } catch {
      toast.error("업데이트에 실패했습니다.");
    } finally {
      setUpdatingId(null);
    }
  };

  // Group cards by issuer. Curated names come first in fixed order; any
  // other issuer the admin / GoWid produces gets its own group sorted by
  // name; cards without an issuer fall into "미분류" at the bottom.
  const grouped = useMemo(() => {
    const groups = new Map<string, CardMapping[]>();
    for (const m of mappings) {
      const key = m.issuer ?? UNGROUPED_KEY;
      const list = groups.get(key) ?? [];
      list.push(m);
      groups.set(key, list);
    }

    const orderedKeys: string[] = [];
    for (const known of ISSUER_OPTIONS) {
      if (groups.has(known)) orderedKeys.push(known);
    }
    const remaining = [...groups.keys()].filter(
      (k) => k !== UNGROUPED_KEY && !ISSUER_OPTIONS.includes(k),
    );
    remaining.sort((a, b) => a.localeCompare(b, "ko"));
    orderedKeys.push(...remaining);
    if (groups.has(UNGROUPED_KEY)) orderedKeys.push(UNGROUPED_KEY);

    return orderedKeys.map((key) => ({
      key,
      label: key === UNGROUPED_KEY ? "미분류" : key,
      cards: (groups.get(key) ?? []).slice().sort((a, b) =>
        (a.cardAlias ?? "").localeCompare(b.cardAlias ?? "", "ko"),
      ),
    }));
  }, [mappings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-[var(--apple-secondary-label)]" />
      </div>
    );
  }

  const totalCards = mappings.length;
  const mappedCount = mappings.filter((m) => m.userId).length;

  return (
    <div className="space-y-4">
      {/* Summary + sync */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <p className="text-footnote text-[var(--apple-secondary-label)]">
            전체 {totalCards}장
          </p>
          <span className="text-footnote text-[var(--apple-secondary-label)]">
            ·
          </span>
          <p className="text-footnote text-[var(--apple-secondary-label)]">
            매핑 {mappedCount}장 / 미매핑 {totalCards - mappedCount}장
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          className="rounded-full glass border-[var(--apple-separator)]"
        >
          {syncing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          <span className="ml-1.5">{syncing ? "동기화 중..." : "지금 동기화"}</span>
        </Button>
      </div>

      {/* Issuer groups */}
      {grouped.length === 0 ? (
        <div className="glass p-8 text-center text-footnote text-[var(--apple-secondary-label)]">
          카드 매핑이 없습니다. &ldquo;지금 동기화&rdquo; 버튼을 눌러 카드 정보를
          가져오세요.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <IssuerGroup
              key={group.key}
              label={group.label}
              cards={group.cards}
              appUsers={appUsers}
              companies={companies}
              updatingId={updatingId}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IssuerGroup({
  label,
  cards,
  appUsers,
  companies,
  updatingId,
  onUpdate,
}: {
  label: string;
  cards: CardMapping[];
  appUsers: AppUser[];
  companies: Company[];
  updatingId: string | null;
  onUpdate: (
    mappingId: string,
    field: "userId" | "companyId" | "issuer",
    value: string | null,
  ) => void;
}) {
  return (
    <section className="glass overflow-hidden">
      {/* Group header */}
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--apple-separator)]">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center size-7 rounded-lg bg-[var(--apple-blue)]/10">
            <CreditCard className="size-3.5 text-[var(--apple-blue)]" />
          </div>
          <h3 className="text-subheadline font-semibold text-[var(--apple-label)]">
            {label}
          </h3>
          <span className="glass-badge glass-badge-gray">
            {cards.length}장
          </span>
        </div>
      </header>

      {/* Card rows */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--apple-separator)] bg-[var(--apple-secondary-system-grouped-background)]/50">
              <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-[var(--apple-secondary-label)]">
                끝 4자리
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-[var(--apple-secondary-label)]">
                카드 별칭
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-[var(--apple-secondary-label)]">
                발급사
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-[var(--apple-secondary-label)]">
                회사
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-[var(--apple-secondary-label)]">
                매핑된 사용자
              </th>
            </tr>
          </thead>
          <tbody>
            {cards.map((m) => {
              const issuerKnown = m.issuer && ISSUER_OPTIONS.includes(m.issuer);
              const issuerSelectValue = m.issuer
                ? issuerKnown
                  ? m.issuer
                  : "__custom__"
                : "";
              return (
                <tr
                  key={m.id}
                  className="border-b border-[var(--apple-separator)] last:border-0 hover:bg-[var(--apple-fill)]/30 transition-colors"
                >
                  <td className="px-4 py-3 text-subheadline font-mono tabular-nums text-[var(--apple-label)]">
                    {m.cardLastFour}
                  </td>
                  <td className="px-4 py-3 text-subheadline text-[var(--apple-label)]">
                    {m.cardAlias || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={issuerSelectValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__custom__") return; // no-op; custom value already set
                        onUpdate(m.id, "issuer", v || null);
                      }}
                      disabled={updatingId === m.id}
                      className="w-full max-w-[140px] rounded-lg border border-[var(--apple-separator)] bg-transparent px-2 py-1.5 text-subheadline text-[var(--apple-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-blue)]"
                    >
                      <option value="">미분류</option>
                      {ISSUER_OPTIONS.map((iss) => (
                        <option key={iss} value={iss}>
                          {iss}
                        </option>
                      ))}
                      {!issuerKnown && m.issuer && (
                        <option value="__custom__">{m.issuer}</option>
                      )}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={m.companyId ?? ""}
                      onChange={(e) =>
                        onUpdate(m.id, "companyId", e.target.value || null)
                      }
                      disabled={updatingId === m.id}
                      className="w-full max-w-[160px] rounded-lg border border-[var(--apple-separator)] bg-transparent px-2 py-1.5 text-subheadline text-[var(--apple-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-blue)]"
                    >
                      <option value="">미지정</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={m.userId ?? ""}
                      onChange={(e) =>
                        onUpdate(m.id, "userId", e.target.value || null)
                      }
                      disabled={updatingId === m.id}
                      className="w-full max-w-[220px] rounded-lg border border-[var(--apple-separator)] bg-transparent px-2 py-1.5 text-subheadline text-[var(--apple-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-blue)]"
                    >
                      <option value="">미매핑</option>
                      {appUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
