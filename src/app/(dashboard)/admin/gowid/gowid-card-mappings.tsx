"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppUser {
  id: string;
  name: string;
  email: string;
}

interface CardMapping {
  id: string;
  cardLastFour: string;
  cardAlias: string | null;
  userId: string | null;
  companyId: string | null;
  isActive: boolean;
  userName: string | null;
  userEmail: string | null;
}

interface GowidCardMappingsProps {
  appUsers: AppUser[];
}

export function GowidCardMappings({ appUsers }: GowidCardMappingsProps) {
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

  useEffect(() => { fetchMappings(); }, [fetchMappings]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/gowid/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "동기화 실패");
      toast.success(`동기화 완료: ${json.newStaged}건 새로 등록, ${json.notified}건 알림 발송`);
      fetchMappings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "동기화 실패");
    } finally {
      setSyncing(false);
    }
  };

  const handleUserChange = async (mappingId: string, userId: string | null) => {
    setUpdatingId(mappingId);
    try {
      const res = await fetch("/api/gowid/card-mappings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappingId, userId }),
      });
      if (!res.ok) throw new Error("업데이트 실패");
      toast.success("매핑이 업데이트되었습니다.");
      fetchMappings();
    } catch {
      toast.error("매핑 업데이트에 실패했습니다.");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-[var(--apple-secondary-label)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-footnote text-[var(--apple-secondary-label)]">
          카드 {mappings.length}장
        </p>
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

      <div className="glass overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--apple-separator)]">
              <th className="px-4 py-3 text-left text-footnote font-medium text-[var(--apple-secondary-label)]">
                카드 (끝 4자리)
              </th>
              <th className="px-4 py-3 text-left text-footnote font-medium text-[var(--apple-secondary-label)]">
                카드 별칭
              </th>
              <th className="px-4 py-3 text-left text-footnote font-medium text-[var(--apple-secondary-label)]">
                매핑된 사용자
              </th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr
                key={m.id}
                className="border-b border-[var(--apple-separator)] last:border-0"
              >
                <td className="px-4 py-3 text-subheadline font-mono">
                  {m.cardLastFour}
                </td>
                <td className="px-4 py-3 text-subheadline text-[var(--apple-label)]">
                  {m.cardAlias || "—"}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={m.userId ?? ""}
                    onChange={(e) =>
                      handleUserChange(m.id, e.target.value || null)
                    }
                    disabled={updatingId === m.id}
                    className="w-full max-w-[200px] rounded-lg border border-[var(--apple-separator)] bg-transparent px-2 py-1.5 text-subheadline text-[var(--apple-label)] focus:outline-none focus:ring-2 focus:ring-[var(--apple-blue)]"
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
            ))}
            {mappings.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-footnote text-[var(--apple-secondary-label)]"
                >
                  카드 매핑이 없습니다. &ldquo;지금 동기화&rdquo; 버튼을 눌러 고위드에서 카드 정보를 가져오세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
