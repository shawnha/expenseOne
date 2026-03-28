"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Bell, BellRing } from "lucide-react";
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
import type { UserRole } from "@/types";

interface Department {
  id: string;
  name: string;
  sortOrder: number;
}

interface SettingsFormProps {
  user: {
    name: string;
    email: string;
    role: UserRole;
    department: string | null;
    cardLastFour: string | null;
  };
}

const NO_DEPARTMENT_VALUE = "__none__";

export function SettingsForm({ user }: SettingsFormProps) {
  const [name, setName] = useState(user.name);
  const [cardLastFour, setCardLastFour] = useState(user.cardLastFour ?? "");
  const [department, setDepartment] = useState(user.department ?? "");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/departments")
      .then((res) => res.json())
      .then((data) => {
        if (data.data) setDepartments(data.data);
      })
      .catch(() => {});
  }, []);

  const hasChanges =
    name.trim() !== user.name ||
    (cardLastFour || "") !== (user.cardLastFour || "") ||
    (department || "") !== (user.department || "");

  const isValid = name.trim().length > 0 && (cardLastFour === "" || /^\d{4}$/.test(cardLastFour));

  const initial = name.trim() ? name.trim().charAt(0).toUpperCase() : "U";

  const handleSave = async () => {
    if (!isValid || !hasChanges) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          cardLastFour: cardLastFour || "",
          department: department || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message || "프로필 저장에 실패했습니다.");
      }

      toast.success("프로필이 저장되었습니다.");
      // Update the "original" values so hasChanges resets
      user.name = name.trim();
      user.cardLastFour = cardLastFour || null;
      user.department = department || null;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "프로필 저장에 실패했습니다.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const selectedDeptLabel = department
    ? departments.find((d) => d.name === department)?.name ?? department
    : undefined;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="glass p-6 animate-card-enter stagger-1">
        <h2 className="text-[15px] font-semibold text-[var(--apple-label)] mb-5">
          프로필 정보
        </h2>

        {/* Avatar */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-[rgba(0,122,255,0.12)] text-[var(--apple-blue)] text-xl sm:text-2xl font-semibold">
            {initial}
          </div>
          <div>
            <p className="text-base font-semibold text-[var(--apple-label)]">
              {name.trim() || user.name}
            </p>
            <span
              className={
                user.role === "ADMIN"
                  ? "glass-badge glass-badge-blue animate-spring-pop"
                  : "glass-badge glass-badge-gray animate-spring-pop"
              }
            >
              {user.role === "ADMIN" ? "관리자" : "크루"}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {/* Name -- editable */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-name" className="text-[13px] text-[var(--apple-secondary-label)]">
              이름
            </Label>
            <Input
              id="settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력해주세요"
              maxLength={100}
            />
          </div>

          {/* Email -- read-only */}
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-[var(--apple-secondary-label)]">이메일</span>
            <span className="text-sm font-medium text-[var(--apple-label)]">{user.email}</span>
          </div>

          {/* Department -- dropdown */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-department" className="text-[13px] text-[var(--apple-secondary-label)]">
              부서
            </Label>
            <Select
              value={department || NO_DEPARTMENT_VALUE}
              onValueChange={(val: string | null) => {
                setDepartment(val === NO_DEPARTMENT_VALUE || val === null ? "" : val);
              }}
            >
              <SelectTrigger
                className="w-full h-9 text-sm"
                aria-label="부서 선택"
              >
                <SelectValue placeholder="부서를 선택해주세요">
                  {selectedDeptLabel ?? "미지정"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DEPARTMENT_VALUE}>미지정</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.name}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Card last four -- editable */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="settings-card" className="text-[13px] text-[var(--apple-secondary-label)]">
              법인카드 끝 4자리
            </Label>
            <Input
              id="settings-card"
              value={cardLastFour}
              onChange={(e) => {
                const val = e.target.value.replace(/[^\d]/g, "");
                setCardLastFour(val);
              }}
              placeholder="0000"
              maxLength={4}
              inputMode="numeric"
            />
            <p className="text-[12px] text-[var(--apple-secondary-label)]">
              법카사용 내역 제출 시 자동으로 입력됩니다.
            </p>
          </div>

          {/* Save button */}
          <div className="pt-2">
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges || !isValid}
              className="rounded-full h-10 px-8 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] text-white"
            >
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                  저장 중...
                </>
              ) : (
                "저장"
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <div className="glass p-6 animate-card-enter stagger-2">
          <h2 className="text-[15px] font-semibold text-[var(--apple-label)] mb-5">
            계정 정보
          </h2>
          <div className="space-y-3 text-sm text-[var(--apple-secondary-label)]">
            <p>이름, 부서, 법인카드 끝 4자리를 수정할 수 있습니다.</p>
            <p>역할 변경은 관리자에게 문의해주세요.</p>
          </div>
        </div>

        {user.role === "ADMIN" && <PushTestCard />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Push 알림 테스트 카드 (ADMIN only)
// ---------------------------------------------------------------------------
function PushTestCard() {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
    debug?: Record<string, unknown>;
  } | null>(null);
  const [pushStatus, setPushStatus] = useState<string>("확인 중...");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("미지원 (이 브라우저는 Push를 지원하지 않습니다)");
      return;
    }
    if (typeof Notification === "undefined") {
      setPushStatus("미지원");
      return;
    }
    if (Notification.permission === "granted") {
      setPushStatus("허용됨 ✓");
    } else if (Notification.permission === "denied") {
      setPushStatus("차단됨 ✕ (브라우저 설정에서 허용해주세요)");
    } else {
      setPushStatus("미설정 (알림 배너에서 허용해주세요)");
    }
  }, []);

  const handleTest = useCallback(async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = await res.json();
      setResult(data);
      if (data.ok) {
        toast.success("테스트 Push 전송 완료!");
      } else {
        toast.error(data.message || "Push 전송 실패");
      }
    } catch (err) {
      setResult({ ok: false, message: "요청 실패" });
      toast.error("Push 테스트 요청에 실패했습니다.");
    } finally {
      setSending(false);
    }
  }, []);

  return (
    <div className="glass p-6 animate-card-enter stagger-3">
      <h2 className="text-[15px] font-semibold text-[var(--apple-label)] mb-4 flex items-center gap-2">
        <BellRing className="size-4" />
        Push 알림 테스트
      </h2>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-[var(--apple-secondary-label)]">알림 권한</span>
          <span className="text-[13px] font-medium text-[var(--apple-label)]">{pushStatus}</span>
        </div>

        <Button
          onClick={handleTest}
          disabled={sending}
          className="w-full rounded-full h-10 bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] text-white"
        >
          {sending ? (
            <>
              <Loader2 className="size-4 animate-spin mr-1.5" />
              전송 중...
            </>
          ) : (
            <>
              <Bell className="size-4 mr-1.5" />
              테스트 알림 보내기
            </>
          )}
        </Button>

        {result && (
          <div
            className={`rounded-xl p-3 text-[13px] ${
              result.ok
                ? "bg-[rgba(52,199,89,0.1)] text-[var(--apple-green)]"
                : "bg-[rgba(255,59,48,0.1)] text-[var(--apple-red)]"
            }`}
          >
            <p className="font-medium">{result.message}</p>
            {result.debug && (
              <pre className="mt-2 text-[11px] opacity-70 whitespace-pre-wrap break-all">
                {JSON.stringify(result.debug, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
