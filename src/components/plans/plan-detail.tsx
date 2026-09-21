"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, EyeOff, Link2, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CompanyBadge } from "@/components/companies/company-badge";
import { formatKRW } from "@/lib/utils/expense-utils";
import type {
  LinkCandidate,
  LinkSuggestion,
  PlanChangeRow,
  PlanDetail,
  PlanLinkRow,
} from "@/services/plan.service";
import { CommentThread } from "./comment-thread";
import { PlanDialog, type PlanEditTarget } from "./plan-dialog";
import {
  diffBadge,
  EXPENSE_STATUS_LABEL,
  formatStamp,
  jsonBody,
  planFetch,
  PLAN_STATUS_LABEL,
} from "./plan-client";

// ---------------------------------------------------------------------------
// 계획 상세. 필드·담당자·요약·연결된 입금요청·메모·최근 이력 10.
//
// 연결의 금액은 **연결하던 순간의 스냅샷**이다(결정 1-2). 요청이 그 뒤에 바뀌어도 합계는
// 움직이지 않고, 대신 '제출 후 수정됨'으로 알려 준다 — 계획이 소리 없이 재계산되지 않게.
// ---------------------------------------------------------------------------

const FIELD_LABEL: Record<string, string> = {
  title: "제목",
  amount: "금액",
  plannedDate: "예정일",
  datePrecision: "날짜 단위",
  brandId: "분류",
  projectId: "프로젝트",
  vendorName: "거래처",
  description: "설명",
  status: "상태",
};

const LOG_LABEL: Record<string, string> = {
  "plan:CREATE": "계획 등록",
  "plan:UPDATE": "계획 수정",
  "link:LINK": "입금요청 연결",
  "link:UNLINK": "연결 해제",
  "comment:CREATE": "메모 작성",
  "comment:UPDATE": "메모 수정",
  "comment:DELETE": "메모 삭제",
  "member:ADD": "참여자 추가",
  "member:REMOVE": "참여자 제거",
  "project:CREATE": "프로젝트 등록",
  "brand:CREATE": "분류 추가",
};

function logLine(row: PlanChangeRow): { label: string; detail: string | null } {
  const after = (row.after ?? {}) as Record<string, unknown>;
  if (row.entityType === "plan" && row.action === "UPDATE" && after.status === "CANCELLED") {
    return { label: "계획 취소", detail: row.reason };
  }
  const label = LOG_LABEL[`${row.entityType}:${row.action}`] ?? `${row.entityType} ${row.action}`;
  if (row.entityType === "plan" && row.action === "UPDATE") {
    const changed = Object.keys(after)
      .filter((key) => key !== "version")
      .map((key) => FIELD_LABEL[key] ?? key);
    return { label, detail: changed.length > 0 ? `${changed.join(", ")} 변경` : row.reason };
  }
  return { label, detail: row.reason };
}

/** 요약 타일의 '차이' — diffBadge 와 같은 말. 연결이 없으면 비교할 대상이 없다. */
function diffText(diff: number, linkCount: number): string {
  if (linkCount === 0) return "-";
  if (diff === 0) return "계획과 일치";
  return `${formatKRW(Math.abs(diff))} ${diff < 0 ? "초과" : "남음"}`;
}

interface PlanDetailViewProps {
  detail: PlanDetail;
}

export function PlanDetailView({ detail }: PlanDetailViewProps) {
  const { plan, summary, links, comments, changeLog, canEdit } = detail;
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);

  const editTarget: PlanEditTarget = {
    id: plan.id,
    version: plan.version,
    companyId: plan.companyId,
    companyName: plan.companyName,
    projectId: plan.projectId,
    brandId: plan.brandId,
    // 비활성화된 브랜드는 다이얼로그의 선택 목록에 없다. 이름을 같이 넘겨야 '공통'으로 잘못 보이지 않는다.
    brandName: plan.brandName,
    title: plan.title,
    amount: plan.amount,
    plannedDate: plan.plannedDate,
    datePrecision: plan.datePrecision,
    vendorName: plan.vendorName,
    description: plan.description,
    status: plan.status,
  };

  const handleUnlink = useCallback(
    async (linkId: string) => {
      setUnlinking(linkId);
      const res = await planFetch(`/api/plans/items/${plan.id}/links?linkId=${linkId}`, {
        method: "DELETE",
      });
      setUnlinking(null);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("연결을 해제했습니다.");
      router.refresh();
    },
    [plan.id, router],
  );

  const diff = diffBadge(summary.diff, summary.linkCount);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="animate-fade-up">
        <Link
          href="/plans"
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-footnote text-[var(--apple-blue)] transition-colors hover:bg-[var(--apple-blue)]/10"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          비용계획
        </Link>
      </div>

      {/* 머리 */}
      <section className="glass p-4 sm:p-5 animate-fade-up">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {plan.status !== "PLANNED" && (
                <span className="glass-badge glass-badge-gray">
                  {PLAN_STATUS_LABEL[plan.status] ?? plan.status}
                </span>
              )}
              <CompanyBadge name={plan.companyName} slug={plan.companySlug} />
              <span className="text-caption1 text-[var(--apple-secondary-label)]">
                {plan.projectName}
                {plan.brandName ? ` · ${plan.brandName}` : " · 공통"}
              </span>
            </div>
            <h1 className="mt-1.5 text-title3 text-[var(--apple-label)] break-keep">{plan.title}</h1>
            <p className="mt-1 text-footnote tabular-nums text-[var(--apple-secondary-label)]">
              {plan.plannedDateLabel}
              {plan.ownerName && ` · 담당 ${plan.ownerName}`}
            </p>
          </div>
          {canEdit && (
            <Button type="button" size="lg" variant="outline" onClick={() => setEditOpen(true)}>
              수정
            </Button>
          )}
        </div>

        {/* 요약 — 모바일에서 금액 한 줄이 85px 타일을 넘지 않도록 2열로 (홈의 스탯 그리드와 같은 모양) */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <SummaryTile label="계획 금액" value={formatKRW(plan.amount)} />
          <SummaryTile label="요청 합계" value={formatKRW(summary.requestedSum)} />
          <SummaryTile
            label="차이"
            // 부호(-1,000,000원) 대신 카드 배지와 같은 말로 읽는다 — 한 화면에서 같은 값이 두 표기로 나오지 않게.
            value={diffText(summary.diff, summary.linkCount)}
            tone={summary.diff < 0 ? "red" : undefined}
            className="col-span-2 sm:col-span-1"
          />
        </div>
        {diff && (
          <p className="mt-2 text-caption1 text-[var(--apple-secondary-label)]">
            연결 {summary.linkCount}건 · {diff.label}
          </p>
        )}
      </section>

      {/* 필드 */}
      <section className="glass p-4 sm:p-5" aria-label="상세 정보">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="거래처" value={plan.vendorName ?? "-"} />
          <Field label="분류" value={plan.brandName ?? "공통"} />
          <Field label="프로젝트" value={plan.projectName} />
          <Field label="법인" value={plan.companyName} />
          <Field label="담당자" value={plan.ownerName ?? "-"} />
          <Field
            label="마지막 수정"
            value={`${formatStamp(plan.updatedAt)}${plan.updatedByName ? ` · ${plan.updatedByName}` : ""}`}
          />
          {plan.description && (
            <div className="sm:col-span-2">
              <dt className="text-caption1 text-[var(--apple-secondary-label)]">설명</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-footnote text-[var(--apple-label)]">
                {plan.description}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* 연결된 입금요청 */}
      <section className="glass p-4 sm:p-5" aria-label="연결된 입금요청">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-headline text-[var(--apple-label)]">연결된 입금요청</h2>
          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={() => setLinkOpen(true)}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              연결
            </Button>
          )}
        </div>
        <p className="mt-1 text-caption2 text-[var(--apple-secondary-label)] break-keep">
          연결한 순간의 금액으로 비교합니다. 요청을 나중에 고쳐도 계획 합계는 바뀌지 않습니다(요청 원본 유지).
        </p>

        {/* 제안은 사람이 눌러야 이어진다 — 잘못 이으면 그 순간의 금액이 스냅샷으로 얼어붙는다. */}
        {canEdit && <LinkSuggestions planId={plan.id} />}

        {links.length === 0 ? (
          <p className="mt-3 text-footnote text-[var(--apple-secondary-label)] break-keep">
            계획을 세운 뒤 실제 입금요청을 올리면, 그 요청을 여기에 이어 두고 계획 금액과 실제 요청 금액의 차이를
            봅니다. 비슷한 요청이 있으면 자동으로 찾아 제안합니다. 아직 이어 둔 요청이 없습니다.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {links.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                busy={unlinking === link.id}
                onUnlink={() => void handleUnlink(link.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <CommentThread planId={plan.id} initialComments={comments} />

      {/* 이력 */}
      <section className="glass p-4 sm:p-5" aria-label="변경 이력">
        <h2 className="text-headline text-[var(--apple-label)]">최근 변경</h2>
        {changeLog.length === 0 ? (
          <p className="mt-3 text-footnote text-[var(--apple-secondary-label)]">기록이 없습니다.</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-2.5">
            {changeLog.map((row) => {
              const line = logLine(row);
              return (
                <li key={row.id} className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-footnote text-[var(--apple-label)]">
                      {line.label}
                      {row.actorName && (
                        <span className="text-[var(--apple-secondary-label)]"> · {row.actorName}</span>
                      )}
                    </p>
                    {line.detail && (
                      <p className="text-caption2 text-[var(--apple-secondary-label)] break-keep">
                        {line.detail}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
                    {formatStamp(row.createdAt)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {editOpen && <PlanDialog open onOpenChange={setEditOpen} plan={editTarget} />}
      {linkOpen && (
        <LinkDialog planId={plan.id} open={linkOpen} onOpenChange={setLinkOpen} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SummaryTile({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string;
  tone?: "red";
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl bg-[var(--apple-tertiary-system-fill)] px-3 py-2.5", className)}>
      <p className="text-caption2 text-[var(--apple-secondary-label)]">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-[15px] font-semibold tabular-nums",
          tone === "red" ? "text-[var(--apple-red)]" : "text-[var(--apple-label)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption1 text-[var(--apple-secondary-label)]">{label}</dt>
      <dd className="mt-0.5 text-footnote text-[var(--apple-label)] break-keep">{value}</dd>
    </div>
  );
}

function LinkRow({
  link,
  busy,
  onUnlink,
}: {
  link: PlanLinkRow;
  busy: boolean;
  onUnlink: () => void;
}) {
  return (
    <li className="rounded-xl border border-[var(--apple-separator)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-footnote font-medium text-[var(--apple-label)] truncate">
            {link.deleted || !link.expenseId ? (
              link.snapshotTitle
            ) : (
              <Link href={`/expenses/${link.expenseId}`} className="hover:underline">
                {link.snapshotTitle}
              </Link>
            )}
          </p>
          <p className="mt-0.5 text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
            제출 {formatStamp(link.snapshotSubmittedAt)}
            {link.snapshotDueDate && ` · 기일 ${link.snapshotDueDate.replace(/-/g, ".")}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-footnote font-semibold tabular-nums text-[var(--apple-label)]">
            {formatKRW(link.snapshotAmount)}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-0.5 min-h-11 text-[var(--apple-red)]"
            onClick={onUnlink}
            disabled={busy}
          >
            {busy ? "해제 중" : "해제"}
          </Button>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {link.deleted ? (
          <span className="glass-badge glass-badge-red">삭제된 요청</span>
        ) : (
          link.currentStatus && (
            <span className="glass-badge glass-badge-gray">
              {EXPENSE_STATUS_LABEL[link.currentStatus] ?? link.currentStatus}
            </span>
          )
        )}
        {link.modifiedAfterLink && (
          <span className="glass-badge glass-badge-orange">
            제출 후 수정됨
            {link.currentAmount !== null && ` · 현재 ${formatKRW(link.currentAmount)}`}
            {" (요청 원본 유지)"}
          </span>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 연결 제안 — 같은 법인의 연결되지 않은 입금요청 중 날짜(±45일)나 금액(0.8~1.25배)이 맞는 것 최대 5건.
// '연결'을 눌러야 이어진다. '숨기기'는 이 화면에 있는 동안만(새로고침하면 다시 나온다).
// ---------------------------------------------------------------------------

const REASON_LABEL: Record<LinkSuggestion["reasons"][number], string> = {
  date: "날짜",
  amount: "금액",
  title: "제목",
};

function suggestionHint(s: LinkSuggestion): string {
  const parts: string[] = [];
  if (s.dateDiffDays !== null && s.reasons.includes("date")) {
    parts.push(
      s.dateDiffDays === 0 ? "예정일과 같은 날" : `예정일 ${Math.abs(s.dateDiffDays)}일 ${s.dateDiffDays > 0 ? "뒤" : "앞"}`,
    );
  }
  const rest = s.reasons.filter((r) => r !== "date").map((r) => REASON_LABEL[r]);
  if (rest.length > 0) parts.push(`${rest.join("·")} 비슷`);
  return parts.join(" · ");
}

function LinkSuggestions({ planId }: { planId: string }) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<LinkSuggestion[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void planFetch<{ suggestions: LinkSuggestion[] }>(`/api/plans/items/${planId}/link-suggestions`).then((res) => {
      if (!alive) return;
      // 제안은 곁들이다 — 실패해도 상세를 막지 않고 조용히 비운다.
      setSuggestions(res.ok ? res.data.suggestions : []);
    });
    return () => {
      alive = false;
    };
  }, [planId]);

  const handleLink = useCallback(
    async (expenseId: string) => {
      setLinking(expenseId);
      const res = await planFetch<{ linkId: string }>(`/api/plans/items/${planId}/links`, jsonBody({ expenseId }));
      setLinking(null);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setSuggestions((prev) => (prev ? prev.filter((s) => s.id !== expenseId) : prev));
      toast.success("입금요청을 연결했습니다.");
      router.refresh();
    },
    [planId, router],
  );

  const visible = (suggestions ?? []).filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return null;

  return (
    <div className="mt-3 rounded-2xl border border-[var(--apple-blue)]/25 bg-[var(--apple-blue)]/5 p-3" aria-label="연결 제안">
      <p className="inline-flex items-center gap-1.5 text-footnote font-semibold text-[var(--apple-label)]">
        <Sparkles className="size-3.5 text-[var(--apple-blue)]" aria-hidden="true" />
        연결 제안 {visible.length}건
      </p>
      <p className="mt-0.5 text-caption2 text-[var(--apple-secondary-label)] break-keep">
        날짜나 금액이 이 계획과 비슷한 입금요청입니다. 맞는 건만 골라 연결하세요.
      </p>
      <ul className="mt-2 flex flex-col gap-2">
        {visible.map((s) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-[var(--apple-system-background)] px-3 py-2.5"
          >
            <div className="min-w-0 flex-1 basis-40">
              <p className="text-footnote font-medium text-[var(--apple-label)] truncate">
                <Link href={`/expenses/${s.id}`} className="hover:underline">
                  {s.title}
                </Link>
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
                <span className="glass-badge glass-badge-gray">{EXPENSE_STATUS_LABEL[s.status] ?? s.status}</span>
                <span>제출 {formatStamp(s.createdAt).slice(0, 10)}</span>
                {s.submitterName && <span>· {s.submitterName}</span>}
                <span>· {suggestionHint(s)}</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="mr-1 text-footnote font-semibold tabular-nums text-[var(--apple-label)]">
                {formatKRW(s.amount)}
              </span>
              <Button
                type="button"
                size="sm"
                className="min-h-11 rounded-full"
                onClick={() => void handleLink(s.id)}
                disabled={linking !== null}
              >
                <Link2 className="size-3.5" aria-hidden="true" />
                {linking === s.id ? "연결 중" : "연결"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="min-h-11 rounded-full text-[var(--apple-secondary-label)]"
                aria-label={`${s.title} 제안 숨기기`}
                onClick={() => setHidden((prev) => new Set(prev).add(s.id))}
                disabled={linking !== null}
              >
                <EyeOff className="size-3.5" aria-hidden="true" />
                숨기기
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 연결 다이얼로그 — 같은 법인의 아직 연결되지 않은 입금요청만 서버가 골라서 준다.
// ---------------------------------------------------------------------------

function LinkDialog({
  planId,
  open,
  onOpenChange,
}: {
  planId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<LinkCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  // 입력이 멈춘 뒤에 찾는다. 글자마다 부르면 같은 표를 여러 번 훑는다.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      const search = query.trim();
      const res = await planFetch<{ candidates: LinkCandidate[] }>(
        `/api/plans/items/${planId}/link-candidates${search ? `?q=${encodeURIComponent(search)}` : ""}`,
      );
      setLoading(false);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setCandidates(res.data.candidates);
    }, 250);
    return () => clearTimeout(timer);
  }, [open, query, planId]);

  const handleLink = useCallback(
    async (expenseId: string) => {
      setLinking(expenseId);
      const res = await planFetch<{ linkId: string }>(
        `/api/plans/items/${planId}/links`,
        jsonBody({ expenseId }),
      );
      setLinking(null);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("입금요청을 연결했습니다.");
      onOpenChange(false);
      router.refresh();
    },
    [planId, onOpenChange, router],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg max-h-[86dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-headline text-[var(--apple-label)]">입금요청 연결</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--apple-secondary-label)]"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
              placeholder="제목으로 찾기"
              aria-label="입금요청 제목 검색"
              className="pl-9"
            />
          </div>

          {loading && candidates === null ? (
            <div className="h-16 rounded-xl bg-[var(--apple-tertiary-system-fill)] animate-pulse" />
          ) : (candidates ?? []).length === 0 ? (
            <p className="py-6 text-center text-footnote text-[var(--apple-secondary-label)]">
              연결할 수 있는 입금요청이 없습니다. 같은 법인의 KRW 입금요청 중 아직 다른 계획에 이어지지
              않은 건만 보입니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(candidates ?? []).map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => void handleLink(candidate.id)}
                    disabled={linking !== null}
                    className="flex w-full min-h-11 items-center justify-between gap-3 rounded-xl border border-[var(--apple-separator)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--apple-tertiary-system-fill)] disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-footnote font-medium text-[var(--apple-label)]">
                        {candidate.title}
                      </span>
                      <span className="block text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
                        {EXPENSE_STATUS_LABEL[candidate.status] ?? candidate.status}
                        {candidate.submitterName && ` · ${candidate.submitterName}`}
                        {candidate.dueDate && ` · 기일 ${candidate.dueDate.replace(/-/g, ".")}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-footnote font-semibold tabular-nums text-[var(--apple-label)]">
                      {linking === candidate.id ? (
                        "연결 중..."
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Link2 className="size-3.5" aria-hidden="true" />
                          {formatKRW(candidate.amount)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
