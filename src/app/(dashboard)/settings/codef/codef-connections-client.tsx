"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, CheckCircle2, AlertCircle, CreditCard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CARD_COMPANIES = [
  { key: "shinhan", name: "신한카드" },
  { key: "hyundai", name: "현대카드" },
  { key: "samsung", name: "삼성카드" },
  { key: "kb", name: "KB국민카드" },
  { key: "lotte", name: "롯데카드" },
  { key: "hana", name: "하나카드" },
  { key: "woori", name: "우리카드" },
  { key: "bc", name: "BC카드" },
  { key: "nh", name: "NH농협카드" },
  { key: "citi", name: "씨티카드" },
] as const;

const CARD_NAME_MAP: Record<string, string> = Object.fromEntries(
  CARD_COMPANIES.map((c) => [c.key, c.name]),
);

interface Connection {
  id: string;
  cardCompany: string;
  cardNoMasked: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  createdAt: string;
}

interface Props {
  connections: Connection[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

export default function CodefConnectionsClient({ connections }: Props) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [cardCompany, setCardCompany] = useState<string>("");
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setCardCompany("");
    setLoginId("");
    setLoginPassword("");
    setConsent(false);
    setShowAdd(false);
  }, []);

  const handleConnect = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!cardCompany || !loginId || !loginPassword) {
        toast.error("모든 필드를 입력해주세요");
        return;
      }
      if (!consent) {
        toast.error("제3자 정보 제공 동의가 필요합니다");
        return;
      }
      setIsSubmitting(true);
      try {
        const res = await fetch("/api/codef/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardCompany,
            loginId,
            loginPassword,
            consent: true,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error?.message ?? "연결 실패");
        }
        if (json.data.firstSyncError) {
          toast.warning(
            `연결은 성공했지만 첫 동기화 실패: ${json.data.firstSyncError}`,
          );
        } else {
          toast.success("카드 연결 성공 — 첫 동기화 완료");
        }
        resetForm();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "연결 실패");
      } finally {
        setIsSubmitting(false);
      }
    },
    [cardCompany, loginId, loginPassword, consent, router, resetForm],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("이 카드 연결을 해제하시겠습니까?")) return;
      setDeletingId(id);
      try {
        const res = await fetch(`/api/codef/connections/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          throw new Error("연결 해제 실패");
        }
        toast.success("연결 해제됨");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "연결 해제 실패");
      } finally {
        setDeletingId(null);
      }
    },
    [router],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 기존 연결 목록 */}
      {connections.length > 0 && (
        <div className="glass-subtle rounded-2xl p-4 sm:p-5 flex flex-col gap-3">
          <h2 className="text-body font-semibold text-[var(--apple-label)]">
            연결된 카드
          </h2>
          <div className="flex flex-col gap-2">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--apple-fill-quaternary)]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center justify-center size-10 rounded-full bg-[var(--apple-fill-tertiary)]">
                    <CreditCard className="size-5 text-[var(--apple-secondary-label)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-body text-[var(--apple-label)] truncate">
                      {CARD_NAME_MAP[conn.cardCompany] ?? conn.cardCompany}
                      {conn.cardNoMasked ? ` (${conn.cardNoMasked})` : ""}
                    </div>
                    <div className="text-caption1 text-[var(--apple-secondary-label)] flex items-center gap-1.5">
                      {conn.lastSyncStatus === "ok" ? (
                        <CheckCircle2 className="size-3 text-green-500" />
                      ) : conn.lastSyncStatus === "error" ? (
                        <AlertCircle className="size-3 text-red-500" />
                      ) : null}
                      <span>마지막 동기화: {formatDate(conn.lastSyncAt)}</span>
                    </div>
                    {conn.lastSyncError && (
                      <div className="text-caption2 text-red-500 mt-0.5 truncate">
                        {conn.lastSyncError}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={deletingId === conn.id}
                  onClick={() => handleDelete(conn.id)}
                  className="rounded-full"
                >
                  {deletingId === conn.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4 text-[var(--apple-secondary-label)]" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 카드 추가 */}
      {!showAdd ? (
        <Button
          onClick={() => setShowAdd(true)}
          className="rounded-full self-start"
        >
          <Plus className="size-4 mr-1.5" />
          카드 연결하기
        </Button>
      ) : (
        <form
          onSubmit={handleConnect}
          className="glass-subtle rounded-2xl p-4 sm:p-5 flex flex-col gap-4"
        >
          <h2 className="text-body font-semibold text-[var(--apple-label)]">
            카드사 계정 연결
          </h2>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cardCompany">카드사</Label>
            <Select value={cardCompany} onValueChange={(v) => setCardCompany(v ?? "")}>
              <SelectTrigger id="cardCompany" className="rounded-xl">
                <SelectValue placeholder="카드사 선택" />
              </SelectTrigger>
              <SelectContent>
                {CARD_COMPANIES.map((c) => (
                  <SelectItem key={c.key} value={c.key}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="loginId">카드사 홈페이지 아이디</Label>
            <Input
              id="loginId"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              autoComplete="off"
              className="rounded-xl"
              placeholder="홈페이지 로그인 ID"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="loginPassword">비밀번호</Label>
            <Input
              id="loginPassword"
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              autoComplete="off"
              className="rounded-xl"
              placeholder="홈페이지 로그인 비밀번호"
            />
            <p className="text-caption2 text-[var(--apple-secondary-label)]">
              비밀번호는 Codef 서버에만 전송되며, expenseone 에는 저장되지 않습니다.
            </p>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span className="text-footnote text-[var(--apple-secondary-label)]">
              카드사 로그인 정보를 Codef(쿠콘/헥토데이터) 에 제공하고,
              expenseone 이 해당 계정의 법카 승인내역을 자동 조회하는 것에
              동의합니다. 비밀번호는 expenseone DB 에 저장되지 않으며,
              연결 해제 시 즉시 중단됩니다.
            </span>
          </label>

          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-full flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                  연결 중...
                </>
              ) : (
                "연결"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={resetForm}
              disabled={isSubmitting}
              className="rounded-full"
            >
              취소
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
