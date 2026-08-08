"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CompanyBadge } from "@/components/companies/company-badge";
import { COMPANY_CURRENCIES } from "@/lib/validations/company";
import { cn } from "@/lib/utils";

export interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  currency: string;
  slackChannelId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  expenseCount: number;
  userCount: number;
  departmentCount: number;
  /** GOWID_API_KEY_<SLUG> 설정 여부 (값은 서버에 남는다) */
  gowid: boolean;
  /** SLACK_BOT_TOKEN_<SLUG> + SLACK_CHANNEL_ID_<SLUG> 둘 다 설정됐는지 */
  slackMirror: boolean;
}

/** slug → 환경변수 접미사. 서버(page.tsx)와 같은 규칙. */
function envSuffix(slug: string): string {
  return slug.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

/** 회사명에서 slug 후보를 만든다. 한글은 영문으로 못 바꾸므로 비워둔다. */
function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CompanyManager({
  initialCompanies,
  orphanEnvNames = [],
}: {
  initialCompanies: CompanyRow[];
  /** 어느 회사에도 대응하지 않는 연동 환경변수 이름 (값 아님) */
  orphanEnvNames?: string[];
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyRow | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {/* 키를 교체하고 옛 변수를 안 지웠거나 slug에 오타가 나면, 대응하는 회사가
          없는 GoWid 계정이 조용히 계속 동기화된다. 여기서 눈에 띄게 만든다. */}
      {orphanEnvNames.length > 0 && (
        <div className="glass rounded-xl border border-[rgba(255,149,0,0.3)] bg-[rgba(255,149,0,0.08)] p-4">
          <p className="text-sm font-medium text-[var(--apple-orange)]">
            대응하는 회사가 없는 연동 환경변수 {orphanEnvNames.length}개
          </p>
          <p className="mt-1 text-[12px] text-[var(--apple-secondary-label)]">
            slug 오타이거나 폐기 후 남은 값일 수 있습니다. GoWid 키라면 그 계정의
            카드 거래가 회사 미지정으로 계속 들어옵니다. 확인 후 Vercel에서 지우세요.
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {orphanEnvNames.map((n) => (
              <li
                key={n}
                className="rounded-md bg-[rgba(255,149,0,0.12)] px-2 py-0.5 font-mono text-[11px] text-[var(--apple-orange)]"
              >
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          onClick={() => setAddOpen(true)}
          className="rounded-full bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)]"
        >
          <Plus className="size-4" />
          회사 추가
        </Button>
      </div>

      {/* 카드 하나가 가로를 다 먹으면 데스크톱에서 오른쪽이 통째로 빈다.
          내용이 세로로 짧은 카드라 2열로 채우는 편이 낫다. */}
      <div className="grid gap-3 lg:grid-cols-2">
        {initialCompanies.map((c) => (
          <CompanyCard key={c.id} company={c} onEdit={() => setEditing(c)} />
        ))}
        {initialCompanies.length === 0 && (
          <p className="glass p-6 text-center text-sm text-[var(--apple-secondary-label)] lg:col-span-2">
            등록된 회사가 없습니다.
          </p>
        )}
      </div>

      <CompanyDialog
        key={editing?.id ?? "new"}
        open={addOpen || editing !== null}
        company={editing}
        onClose={() => {
          setAddOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          setAddOpen(false);
          setEditing(null);
          router.refresh();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 목록 카드
// ---------------------------------------------------------------------------

function CompanyCard({
  company,
  onEdit,
}: {
  company: CompanyRow;
  onEdit: () => void;
}) {
  const suffix = envSuffix(company.slug);
  return (
    <div
      className={cn(
        "glass-card p-4 flex flex-col gap-3",
        !company.isActive && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CompanyBadge name={company.name} slug={company.slug} />
            <span className="text-[11px] font-medium tabular-nums text-[var(--apple-secondary-label)]">
              {company.currency}
            </span>
            {!company.isActive && (
              <span className="glass-badge-gray text-[11px]">비활성</span>
            )}
          </div>
          <p className="truncate font-mono text-[11px] text-[var(--apple-secondary-label)]">
            {company.slug}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="shrink-0 rounded-full"
        >
          <Pencil className="size-3.5" />
          수정
        </Button>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--apple-secondary-label)]">
        <span>
          비용 <span className="tabular-nums text-[var(--apple-label)]">{company.expenseCount}</span>건
        </span>
        <span>
          사용자 <span className="tabular-nums text-[var(--apple-label)]">{company.userCount}</span>명
        </span>
        <span>
          부서 <span className="tabular-nums text-[var(--apple-label)]">{company.departmentCount}</span>개
        </span>
      </div>

      {/* 연동 상태 — 새 법인을 붙일 때 무엇이 남았는지 여기서 바로 보인다 */}
      <div className="flex flex-col gap-1.5 border-t border-[var(--apple-separator)] pt-3">
        <IntegrationLine
          ok={company.gowid}
          label="고위드 법인카드"
          hint={
            company.slug === "korea"
              ? "GOWID_API_KEY"
              : `GOWID_API_KEY_${suffix}`
          }
        />
        <IntegrationLine
          ok={company.slackMirror}
          label="Slack 별도 워크스페이스"
          hint={`SLACK_BOT_TOKEN_${suffix} + SLACK_CHANNEL_ID_${suffix}`}
          optional
        />
      </div>
    </div>
  );
}

function IntegrationLine({
  ok,
  label,
  hint,
  optional,
}: {
  ok: boolean;
  label: string;
  hint: string;
  optional?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-[12px]">
      {ok ? (
        <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--apple-green)]" />
      ) : (
        <X className="mt-0.5 size-3.5 shrink-0 text-[var(--apple-secondary-label)]" />
      )}
      <div className="flex min-w-0 flex-col">
        <span className={ok ? "text-[var(--apple-label)]" : "text-[var(--apple-secondary-label)]"}>
          {label}
          {!ok && optional && " (선택)"}
        </span>
        {!ok && (
          <span className="truncate font-mono text-[11px] text-[var(--apple-secondary-label)]">
            {hint} 미설정
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 추가 / 수정 다이얼로그
// ---------------------------------------------------------------------------

function CompanyDialog({
  open,
  company,
  onClose,
  onSaved,
}: {
  open: boolean;
  company: CompanyRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = company !== null;
  const [name, setName] = useState(company?.name ?? "");
  const [slug, setSlug] = useState(company?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [currency, setCurrency] = useState(company?.currency ?? "KRW");
  const [slackChannelId, setSlackChannelId] = useState(company?.slackChannelId ?? "");
  const [sortOrder, setSortOrder] = useState(String(company?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(company?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  // 비용이 있으면 통화를 바꿀 수 없다(서버에서도 막지만 미리 알려준다).
  const currencyLocked = isEdit && company.expenseCount > 0;

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("회사명을 입력해주세요.");
      return;
    }
    if (!isEdit && !/^[a-z0-9-]+$/.test(slug)) {
      toast.error("slug는 영문 소문자, 숫자, 하이픈만 가능합니다.");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        slackChannelId: slackChannelId.trim() || null,
        sortOrder: Number(sortOrder) || 0,
      };
      if (isEdit) {
        body.isActive = isActive;
        if (!currencyLocked) body.currency = currency;
      } else {
        body.slug = slug.trim();
        body.currency = currency;
      }

      const res = await fetch(
        isEdit ? `/api/companies/${company.id}` : "/api/companies",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "저장에 실패했습니다.");
      }

      toast.success(isEdit ? "수정되었습니다." : "회사가 추가되었습니다.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "회사 수정" : "회사 추가"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "slug는 연동 키로 쓰이므로 변경할 수 없습니다."
              : "추가 후 환경변수를 넣으면 고위드·Slack 연동이 켜집니다."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-name">회사명</Label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(suggestSlug(e.target.value));
              }}
              placeholder="예: 한아원파트너스"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-slug">slug</Label>
            <Input
              id="company-slug"
              value={slug}
              disabled={isEdit}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="예: partners"
              className="font-mono"
            />
            <p className="text-[11px] text-[var(--apple-secondary-label)]">
              {isEdit
                ? "GOWID_API_KEY / SLACK_* 환경변수 이름의 기준이라 고정입니다."
                : `환경변수는 GOWID_API_KEY_${slug ? envSuffix(slug) : "<SLUG>"} 형태가 됩니다.`}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>통화</Label>
            <div className="flex gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--apple-system-grouped-background)] p-1">
              {COMPANY_CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={currencyLocked}
                  onClick={() => setCurrency(c)}
                  className={cn(
                    "flex-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition-all duration-200",
                    currency === c
                      ? "bg-[var(--apple-blue)] text-white shadow-[0_2px_8px_rgba(0,122,255,0.25)]"
                      : "text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]",
                    currencyLocked && "cursor-not-allowed opacity-50",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
            {currencyLocked && (
              <p className="text-[11px] text-[var(--apple-secondary-label)]">
                비용 {company.expenseCount}건이 이 통화로 저장돼 있어 변경할 수 없습니다.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-slack">Slack 채널 ID (선택)</Label>
            <Input
              id="company-slack"
              value={slackChannelId}
              onChange={(e) => setSlackChannelId(e.target.value)}
              placeholder="예: C01ABCDEF"
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-sort">표시 순서</Label>
            <Input
              id="company-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-[var(--apple-label)]">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="size-4 accent-[var(--apple-blue)]"
              />
              활성 — 끄면 새 비용 등록에서 선택할 수 없게 됩니다
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving} className="rounded-full">
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-full bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)]"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? "저장" : "추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
