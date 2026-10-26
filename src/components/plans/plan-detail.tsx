"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Banknote, CreditCard, EyeOff, Link2, Plus, Repeat, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { erpAppliedStamp, erpAppliedText, erpToggleToast } from "@/lib/plans/erp";
import { paidStamp, paidText, paidToggleToast } from "@/lib/plans/paid";
import type {
  LinkCandidate,
  LinkSuggestion,
  PlanChangeRow,
  PlanDetail,
  PlanErpState,
  PlanPaidState,
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
import { PendingCardSection } from "./pending-card-section";
import { UnseenChanges } from "./unseen-changes";
import { useSubmitLock } from "./use-submit-lock";

// ---------------------------------------------------------------------------
// 계획 상세. 필드·담당자·요약·연결된 비용(입금요청·법카)·메모·최근 이력 10.
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
  "link:LINK": "비용 연결",
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
  if (row.entityType === "plan" && row.action === "UPDATE" && typeof after.erpApplied === "boolean") {
    return { label: after.erpApplied ? "ERP 반영 표시" : "ERP 반영 해제", detail: null };
  }
  if (row.entityType === "plan" && row.action === "UPDATE" && typeof after.paid === "boolean") {
    return { label: after.paid ? "지급 완료 표시" : "지급 완료 해제", detail: null };
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
  const { plan, summary, links, comments, changeLog, canEdit, unseen } = detail;
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  // 연결 창을 처음 열 때의 탭. 「법카로 썼어요」(?link=card)로 들어오면 법카, 직접 누르면 전체.
  const [linkInitialKind, setLinkInitialKind] = useState<LinkKind>("all");
  // 연결 창에서 이으면 제안도 다시 묻는다 — 방금 이은 입금요청이 제안에 남아 누르면 409 가 나던 것.
  const [linkVersion, setLinkVersion] = useState(0);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const withLock = useSubmitLock();

  // 계획 카드 메뉴의 「법카로 썼어요」 → ?link=card. 한 번 열고 주소에서 지운다(새로고침해도 다시 열리지 않게).
  // useSearchParams 대신 window 를 읽는다 — Suspense 경계를 요구하지 않고, 이 효과는 마운트 때 한 번만 본다.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("link") !== "card") return;
    if (canEdit) {
      setLinkInitialKind("card");
      setLinkOpen(true);
    }
    // 쿼리만 지운다 — router.replace 는 서버 컴포넌트를 다시 불러온다.
    window.history.replaceState(null, "", `/plans/${plan.id}`);
    // 마운트 때 한 번만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    (linkId: string) =>
      withLock(async () => {
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
      }),
    [withLock, plan.id, router],
  );

  const diff = diffBadge(summary.diff, summary.linkCount);

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="animate-fade-up">
        <Link
          href="/plans"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-footnote text-[var(--apple-blue)] transition-colors hover:bg-[var(--apple-blue)]/10"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          비용계획
        </Link>
      </div>

      {/* 지난번 보신 뒤 다른 사람이 바꾼 것(0027). 보여 준 뒤 본 기록을 남긴다. */}
      {unseen && <UnseenChanges planId={plan.id} unseen={unseen} currentPrecision={plan.datePrecision} />}

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
            {plan.recurring && (
              <div className="mt-2 space-y-1">
                <p className="flex flex-wrap items-center gap-x-2 text-footnote text-[var(--apple-label)]">
                  <span className="inline-flex items-center gap-1">
                    <Repeat className="size-3.5 text-[var(--apple-secondary-label)]" aria-hidden="true" />
                    반복 지급 · {plan.recurring.scheduleLabel}
                  </span>
                  {/* 현재 사용자 id 가 이 컴포넌트에 없다 — 링크는 모두에게 보이고, 서버가 본인·관리자 것만 목록에 준다. */}
                  <Link
                    href={`/expenses/recurring?focus=${plan.recurring.id}`}
                    prefetch={false}
                    className="inline-flex min-h-11 items-center text-[var(--apple-blue)] hover:underline sm:min-h-0"
                  >
                    반복 설정 보기
                  </Link>
                </p>
                <p className="text-caption1 text-[var(--apple-secondary-label)] break-keep">
                  반복을 고치면 아직 손대지 않은 다음 달 계획도 같이 바뀌어요. 이 계획을 직접 고치면 그때부터 반복과 따로 움직여요.
                </p>
              </div>
            )}
          </div>
          {canEdit && (
            <Button type="button" size="lg" variant="outline" onClick={() => setEditOpen(true)}>
              수정
            </Button>
          )}
        </div>

        {/* 계획에서 바로 비용으로 — 보드 카드 메뉴와 같은 두 동작. 모바일은 두 칸을 꽉 채운다. */}
        {canEdit && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Link
              href={`/expenses/new/deposit-request?plan=${plan.id}`}
              className={cn(buttonVariants({ size: "lg" }), "min-w-0")}
            >
              <Banknote className="size-4" aria-hidden="true" />
              입금요청으로 만들기
            </Link>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="min-w-0"
              onClick={() => {
                setLinkInitialKind("card");
                setLinkOpen(true);
              }}
            >
              <CreditCard className="size-4 text-[var(--apple-blue)]" aria-hidden="true" />
              법카로 썼어요
            </Button>
          </div>
        )}

        {/* 요약 — 모바일에서 금액 한 줄이 85px 타일을 넘지 않도록 2열로 (홈의 스탯 그리드와 같은 모양) */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <SummaryTile label="계획 금액" value={formatKRW(plan.amount)} />
          <SummaryTile label="연결 합계" value={formatKRW(summary.requestedSum)} />
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
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="거래처" value={plan.vendorName ?? "-"} />
          <Field label="분류" value={plan.brandName ?? "공통"} />
          <Field label="프로젝트" value={plan.projectName} />
          <Field label="법인" value={plan.companyName} />
          <Field label="담당자" value={plan.ownerName ?? "-"} />
          <Field
            label="마지막 수정"
            value={`${formatStamp(plan.updatedAt)}${plan.updatedByName ? ` · ${plan.updatedByName}` : ""}`}
          />
          {/* 지급 완료는 참여자 누구나. 취소·마감된 계획은 읽기 전용(서버도 409). */}
          {canEdit ? (
            <PaidToggle planId={plan.id} paidAt={plan.paidAt} paidByName={plan.paidByName} />
          ) : (
            <Field label="지급" value={paidText(plan.paidAt, plan.paidByName)} />
          )}
          {/* 대표만 켜고 끈다(서버도 403). 취소·마감된 계획은 모두 읽기 전용(서버도 409). */}
          {detail.isExecutive && canEdit ? (
            <ErpAppliedToggle
              planId={plan.id}
              appliedAt={plan.erpAppliedAt}
              appliedByName={plan.erpAppliedByName}
            />
          ) : (
            <Field label="ERP 반영" value={erpAppliedText(plan.erpAppliedAt, plan.erpAppliedByName)} />
          )}
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

      {/* 연결된 비용(입금요청·법카) */}
      <section className="glass p-4 sm:p-5" aria-label="연결된 비용">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-headline text-[var(--apple-label)]">연결된 비용</h2>
          {canEdit && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                setLinkInitialKind("all");
                setLinkOpen(true);
              }}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              연결
            </Button>
          )}
        </div>
        <p className="mt-1 text-caption2 text-[var(--apple-secondary-label)] break-keep">
          입금요청이나 법카 사용 건을 이어 계획과 실제 쓴 돈을 비교합니다. 연결한 순간의 금액으로 비교해서, 나중에 고쳐도
          계획 합계는 바뀌지 않습니다(원본 유지).
        </p>

        {/* 제안은 사람이 눌러야 이어진다 — 잘못 이으면 그 순간의 금액이 스냅샷으로 얼어붙는다. */}
        {canEdit && <LinkSuggestions planId={plan.id} version={linkVersion} />}

        {/* 같은 결제를 입금요청과 (나중에 자동으로 들어온) 법카로 두 번 이으면 합계가 두 번 잡힌다. 막을 열쇠가 없어 알리기만 한다. */}
        {hasMixedLinkTypes(links) && (
          <p className="mt-3 rounded-xl bg-[var(--apple-orange)]/10 px-3 py-2 text-caption1 text-[var(--apple-label)] break-keep">
            입금요청과 법카가 함께 이어져 있어요. 같은 결제를 두 번 이었다면 한쪽을 해제해 주세요.
          </p>
        )}

        {links.length === 0 ? (
          <p className="mt-3 text-footnote text-[var(--apple-secondary-label)] break-keep">
            이미 올린 입금요청이나 법카 사용 건을 「연결」로 이어 두면 계획 금액과 실제 쓴 금액의 차이를 봅니다.
            비슷한 입금요청이 있으면 자동으로 찾아 제안합니다. 아직 이어 둔 비용이 없습니다.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {links.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                canEdit={canEdit}
                busy={unlinking === link.id}
                onUnlink={() => void handleUnlink(link.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <CommentThread planId={plan.id} initialComments={comments} canEdit={canEdit} />

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
                      {row.isNew && (
                        <span className="glass-badge glass-badge-orange mr-1.5 align-[1px]" title="지난번 보신 뒤의 변경">
                          새
                        </span>
                      )}
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
        <LinkDialog
          planId={plan.id}
          plannedDate={plan.plannedDate}
          initialKind={linkInitialKind}
          open={linkOpen}
          onOpenChange={setLinkOpen}
          onLinked={() => setLinkVersion((v) => v + 1)}
        />
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

/** 서버 값 위에 겹치는 방금 누른 값. 서버가 새 값을 주면(appliedAt 이 바뀌면) 버린다. */
interface ErpOverlay {
  base: string | null;
  applied: boolean;
  at: string | null;
  byName: string | null;
}

interface PaidOverlay {
  /** 이 겹침이 딛고 선 서버 값. 서버가 새 값을 주면(base 가 달라지면) 겹침을 버린다. */
  base: string | null;
  paid: boolean;
  at: string | null;
  byName: string | null;
}


/**
 * 상세의 "ERP 반영" 칸(대표). 체크는 먼저 바꾸고(낙관적) 날짜·이름은 응답으로 채운 뒤 router.refresh().
 * 실패하면 원래대로. version 을 올리지 않는 표시라 열려 있는 수정 다이얼로그와 부딪치지 않는다.
 */
function ErpAppliedToggle({
  planId,
  appliedAt,
  appliedByName,
}: {
  planId: string;
  appliedAt: string | null;
  appliedByName: string | null;
}) {
  const router = useRouter();
  const withLock = useSubmitLock();
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<ErpOverlay | null>(null);

  const view =
    overlay && overlay.base === appliedAt
      ? overlay
      : { applied: appliedAt !== null, at: appliedAt, byName: appliedByName };
  const stamp = erpAppliedStamp(view.at, view.byName);

  const handleChange = useCallback(
    (next: boolean) =>
      withLock(async () => {
        setBusy(true);
        setOverlay({ base: appliedAt, applied: next, at: null, byName: null });
        const res = await planFetch<PlanErpState>(`/api/plans/items/${planId}/erp`, jsonBody({ applied: next }));
        setBusy(false);
        if (!res.ok) {
          setOverlay(null);
          toast.error(res.message);
          return;
        }
        setOverlay({
          base: appliedAt,
          applied: res.data.erpAppliedAt !== null,
          at: res.data.erpAppliedAt,
          byName: res.data.erpAppliedByName,
        });
        toast.success(erpToggleToast(next));
        router.refresh();
      }),
    [withLock, appliedAt, planId, router],
  );

  return (
    <div>
      <dt className="text-caption1 text-[var(--apple-secondary-label)]">ERP 반영</dt>
      <dd className="flex flex-wrap items-center gap-x-3">
        {/* 라벨 전체가 누르는 자리(44px). 체크박스 자체는 16px 이라 혼자서는 손가락에 작다. */}
        <label className="-ml-1 inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-1 text-footnote text-[var(--apple-label)] has-[[data-disabled]]:cursor-default">
          <Checkbox
            checked={view.applied}
            onCheckedChange={(checked) => void handleChange(checked)}
            disabled={busy}
          />
          ERP에 반영함
        </label>
        <span className="text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
          {busy ? "저장 중…" : (stamp ?? "아직 반영 안 됨")}
        </span>
      </dd>
    </div>
  );
}

/**
 * 상세의 "지급" 칸(참여자 누구나). ErpAppliedToggle 과 같은 흐름 — 체크를 먼저 바꾸고 날짜·이름은 응답으로.
 */
function PaidToggle({
  planId,
  paidAt,
  paidByName,
}: {
  planId: string;
  paidAt: string | null;
  paidByName: string | null;
}) {
  const router = useRouter();
  const withLock = useSubmitLock();
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<PaidOverlay | null>(null);

  const view =
    overlay && overlay.base === paidAt ? overlay : { paid: paidAt !== null, at: paidAt, byName: paidByName };
  const stamp = paidStamp(view.at, view.byName);

  const handleChange = useCallback(
    (next: boolean) =>
      withLock(async () => {
        setBusy(true);
        setOverlay({ base: paidAt, paid: next, at: null, byName: null });
        const res = await planFetch<PlanPaidState>(`/api/plans/items/${planId}/paid`, jsonBody({ paid: next }));
        setBusy(false);
        if (!res.ok) {
          setOverlay(null);
          toast.error(res.message);
          return;
        }
        setOverlay({
          base: paidAt,
          paid: res.data.paidAt !== null,
          at: res.data.paidAt,
          byName: res.data.paidByName,
        });
        toast.success(paidToggleToast(next));
        router.refresh();
      }),
    [withLock, paidAt, planId, router],
  );

  return (
    <div>
      <dt className="text-caption1 text-[var(--apple-secondary-label)]">지급</dt>
      <dd className="flex flex-wrap items-center gap-x-3">
        <label className="-ml-1 inline-flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl px-1 text-footnote text-[var(--apple-label)] has-[[data-disabled]]:cursor-default">
          <Checkbox
            checked={view.paid}
            onCheckedChange={(checked) => void handleChange(checked)}
            disabled={busy}
          />
          지급 완료
        </label>
        <span className="text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
          {busy ? "저장 중…" : (stamp ?? "아직 안 나감")}
        </span>
      </dd>
    </div>
  );
}

/** 활성 연결에 입금요청과 법카가 섞였는가 — 같은 결제 이중 연결 경고용. */
function hasMixedLinkTypes(links: PlanLinkRow[]): boolean {
  const types = new Set(links.filter((l) => !l.deleted && l.expenseType).map((l) => l.expenseType));
  return types.has("DEPOSIT_REQUEST") && types.has("CORPORATE_CARD");
}

function LinkRow({
  link,
  canEdit,
  busy,
  onUnlink,
}: {
  link: PlanLinkRow;
  /** 취소·마감된 계획은 해제도 잠긴다(QA D-07, 서버도 409). */
  canEdit: boolean;
  busy: boolean;
  onUnlink: () => void;
}) {
  const isCard = link.expenseType === "CORPORATE_CARD";
  return (
    <li className="rounded-xl border border-[var(--apple-separator)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* 제목 링크는 44px 높이(QA D-08). 오른쪽 금액+해제 버튼 열이 이미 그만큼 높아 행이 길어지지 않는다. */}
          <p className="text-footnote font-medium text-[var(--apple-label)]">
            {link.deleted || !link.expenseId ? (
              <span className="block truncate">{link.snapshotTitle}</span>
            ) : (
              <Link
                href={`/expenses/${link.expenseId}`}
                className="flex min-h-11 items-center truncate rounded-lg hover:underline"
              >
                <span className="truncate">{link.snapshotTitle}</span>
              </Link>
            )}
          </p>
          <p className="mt-0.5 text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
            {isCard && link.transactionDate ? (
              // 법카의 등록 시각은 자동 동기화 시각이라 카드끼리 구분이 안 된다 — 사용일로.
              `사용 ${link.transactionDate.replace(/-/g, ".")}`
            ) : (
              <>
                제출 {formatStamp(link.snapshotSubmittedAt)}
                {link.snapshotDueDate && ` · 기일 ${link.snapshotDueDate.replace(/-/g, ".")}`}
              </>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-footnote font-semibold tabular-nums text-[var(--apple-label)]">
            {formatKRW(link.snapshotAmount)}
          </p>
          {canEdit && (
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
          )}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {link.deleted ? (
          <span className="glass-badge glass-badge-red">삭제된 비용</span>
        ) : isCard ? (
          // 법카는 보통 '승인'이라 유형만 — 취소되면 합계엔 남으니 눈에 띄게.
          link.currentStatus === "APPROVED" || !link.currentStatus ? (
            <span className="glass-badge glass-badge-blue">법카</span>
          ) : (
            <span className="glass-badge glass-badge-red">
              법카 · {EXPENSE_STATUS_LABEL[link.currentStatus] ?? link.currentStatus}
            </span>
          )
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
            {isCard ? " (연결 당시 금액 유지)" : " (요청 원본 유지)"}
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

function LinkSuggestions({ planId, version }: { planId: string; version: number }) {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<LinkSuggestion[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [linking, setLinking] = useState<string | null>(null);
  const withLock = useSubmitLock();

  // 상세를 띄워 둔 채 다른 탭에서 요청을 올리고 돌아오면 그 요청도 제안에 나와야 한다(2026-10-22 팀원 피드백) —
  // 화면이 다시 보일 때마다 새로 묻는다.
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setReloadKey((k) => k + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

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
  }, [planId, reloadKey, version]);

  const handleLink = useCallback(
    (expenseId: string) =>
      withLock(async () => {
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
      }),
    [withLock, planId, router],
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
              {/* 제목 링크는 44px(QA D2-07). */}
              <p className="text-footnote font-medium text-[var(--apple-label)]">
                <Link href={`/expenses/${s.id}`} className="flex min-h-11 items-center rounded-lg hover:underline">
                  <span className="truncate">{s.title}</span>
                </Link>
              </p>
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
                <span className="glass-badge glass-badge-gray">{EXPENSE_STATUS_LABEL[s.status] ?? s.status}</span>
                {/* 상태 배지 "제출" 바로 뒤라 "제출 날짜" 는 "제출 제출 …" 로 읽힌다(QA D2-06). */}
                <span>제출일 {formatStamp(s.createdAt).slice(0, 10)}</span>
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
// 연결 다이얼로그 — 같은 법인의 아직 연결되지 않은 입금요청·법카만 서버가 골라서 준다.
// 법카는 한 계획에 여러 장이 이어지는 일이 많아(수능 프로모션 = 카드 11장) 여러 건을 골라 한 번에 잇는다.
// ---------------------------------------------------------------------------

type LinkKind = "all" | "deposit" | "card";

const LINK_KIND_TABS: Array<{ value: LinkKind; label: string }> = [
  { value: "all", label: "전체" },
  { value: "deposit", label: "입금요청" },
  { value: "card", label: "법카" },
];

/** 후보 한 줄의 날짜 — 법카는 사용일, 입금요청은 기일(없으면 제출일). */
function candidateDateText(c: LinkCandidate): string {
  if (c.type === "CORPORATE_CARD") return `사용 ${c.transactionDate.replace(/-/g, ".")}`;
  if (c.dueDate) return `기일 ${c.dueDate.replace(/-/g, ".")}`;
  // 앞 배지가 "입금요청 · 제출" 이라 "제출 날짜" 는 "제출 제출 …" 로 읽힌다(QA D2-06).
  return `제출일 ${formatStamp(c.createdAt).slice(0, 10)}`;
}

/** 한 번에 이을 수 있는 최대 건수 — 서버 MAX_LINK_BATCH·zod 와 같은 값. */
const MAX_LINK_SELECT = 50;

function LinkDialog({
  planId,
  plannedDate,
  initialKind = "all",
  open,
  onOpenChange,
  onLinked,
}: {
  planId: string;
  plannedDate: string;
  /** 열었을 때 선택돼 있는 탭. 닫았다 다시 열면 이 값으로 돌아간다. */
  initialKind?: LinkKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<LinkKind>(initialKind);
  const [candidates, setCandidates] = useState<LinkCandidate[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  // 검색·탭을 바꿔도 고른 건은 남는다(합계를 보여 주려고 후보 자체를 들고 있는다).
  const [selected, setSelected] = useState<Map<string, LinkCandidate>>(() => new Map());
  const [linking, setLinking] = useState(false);
  const withLock = useSubmitLock();

  // 닫으면 처음으로 — 다음에 열 때 지난 선택이 남아 있으면 엉뚱한 건을 잇는다.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      // 잇는 중에 닫으면 끝난 뒤 앞선 응답이 다시 연 창을 닫는다.
      if (!next && linking) return;
      if (!next) {
        setQuery("");
        setKind(initialKind);
        setSelected(new Map());
        setCandidates(null);
      }
      onOpenChange(next);
    },
    [onOpenChange, linking, initialKind],
  );

  // 입력이 멈춘 뒤에 찾는다. 글자마다 부르면 같은 표를 여러 번 훑는다. 열 때마다 새로 묻는다(방금 올린 건도 보이게).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const timer = setTimeout(async () => {
      const params = new URLSearchParams();
      const search = query.trim();
      if (search) params.set("q", search);
      if (kind !== "all") params.set("kind", kind);
      const qs = params.toString();
      const res = await planFetch<{ candidates: LinkCandidate[]; hasMore: boolean }>(
        `/api/plans/items/${planId}/link-candidates${qs ? `?${qs}` : ""}`,
      );
      if (!alive) return;
      if (!res.ok) {
        toast.error(res.message);
        setCandidates((prev) => prev ?? []);
        return;
      }
      setCandidates(res.data.candidates);
      setHasMore(res.data.hasMore);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, query, kind, planId]);

  const toggle = useCallback((candidate: LinkCandidate, checked: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (checked && next.size >= MAX_LINK_SELECT) return prev;
      if (checked) next.set(candidate.id, candidate);
      else next.delete(candidate.id);
      return next;
    });
  }, []);

  const selectedSum = [...selected.values()].reduce((sum, c) => sum + c.amount, 0);

  const handleLink = useCallback(
    () =>
      withLock(async () => {
        if (selected.size === 0) return;
        setLinking(true);
        const res = await planFetch<{ linkIds: string[]; skipped: number }>(
          `/api/plans/items/${planId}/links`,
          jsonBody({ expenseIds: [...selected.keys()] }),
        );
        setLinking(false);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        const { linkIds, skipped } = res.data;
        toast.success(
          skipped > 0
            ? `${linkIds.length}건을 연결했습니다. ${skipped}건은 이미 연결됐거나 연결할 수 없어 건너뛰었습니다.`
            : `${linkIds.length}건을 연결했습니다.`,
        );
        // linking 이 아직 true 인 클로저라 handleOpenChange 대신 직접 닫는다.
        setQuery("");
        setKind(initialKind);
        setSelected(new Map());
        setCandidates(null);
        onOpenChange(false);
        onLinked();
        router.refresh();
      }),
    [withLock, selected, planId, onOpenChange, onLinked, router, initialKind],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg max-h-[86dvh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-headline text-[var(--apple-label)]">비용 연결</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 space-y-3 overflow-y-auto px-1 -mx-1">
          <div className="flex gap-1 rounded-full bg-[var(--apple-tertiary-system-fill)] p-1" role="group" aria-label="비용 유형">
            {LINK_KIND_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-pressed={kind === tab.value}
                onClick={() => {
                  if (tab.value === kind) return;
                  setKind(tab.value);
                  setCandidates(null); // 지난 탭 목록이 표시 없이 남지 않게
                }}
                className={cn(
                  "min-h-9 flex-1 rounded-full px-3 text-footnote font-medium transition-colors",
                  kind === tab.value
                    ? "bg-[var(--apple-system-background)] text-[var(--apple-label)] shadow-sm"
                    : "text-[var(--apple-secondary-label)]",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {kind === "card" && (
            <>
              <PendingCardSection planId={planId} plannedDate={plannedDate} />
              <h3 className="pt-2 text-subheadline font-semibold text-[var(--apple-label)]">이미 올린 법카에서 연결</h3>
            </>
          )}

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--apple-secondary-label)]"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
              placeholder={kind === "card" ? "이미 올린 법카의 제목·가맹점으로 찾기" : "제목·가맹점으로 찾기"}
              aria-label="비용 제목 검색"
              className="pl-9"
            />
          </div>

          {candidates === null ? (
            <div className="h-16 rounded-xl bg-[var(--apple-tertiary-system-fill)] animate-pulse" />
          ) : (candidates ?? []).length === 0 ? (
            <p className="py-6 text-center text-footnote text-[var(--apple-secondary-label)] break-keep">
              연결할 수 있는 비용이 없습니다. 같은 법인의 원화 입금요청·법카 중 아직 다른 계획에 이어지지 않은 건만
              보입니다(팀원은 본인이 올린 건만).
            </p>
          ) : (
            // 목록만 스크롤 — 고른 건수·합계와 「연결」 버튼은 늘 보이게.
            <ul className="-mx-1 flex max-h-[min(52dvh,28rem)] flex-col gap-2 overflow-y-auto px-1 py-0.5">
              {(candidates ?? []).map((candidate) => {
                const checked = selected.has(candidate.id);
                const full = !checked && selected.size >= MAX_LINK_SELECT;
                return (
                  <li key={candidate.id}>
                    <label
                      className={cn(
                        "flex w-full min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:bg-[var(--apple-tertiary-system-fill)]",
                        checked ? "border-[var(--apple-blue)]/60 bg-[var(--apple-blue)]/5" : "border-[var(--apple-separator)]",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => toggle(candidate, next === true)}
                        disabled={linking || full}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-footnote font-medium text-[var(--apple-label)]">
                          {candidate.title}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption2 tabular-nums text-[var(--apple-secondary-label)]">
                          {candidate.type === "CORPORATE_CARD" ? (
                            <span className="glass-badge glass-badge-blue">법카</span>
                          ) : (
                            <span className="glass-badge glass-badge-gray">
                              입금요청 · {EXPENSE_STATUS_LABEL[candidate.status] ?? candidate.status}
                            </span>
                          )}
                          <span>{candidateDateText(candidate)}</span>
                          {candidate.submitterName && <span>· {candidate.submitterName}</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-footnote font-semibold tabular-nums text-[var(--apple-label)]">
                        {formatKRW(candidate.amount)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {hasMore && (candidates ?? []).length > 0 && (
            <p className="text-center text-caption2 text-[var(--apple-secondary-label)] break-keep">
              최근 {MAX_LINK_SELECT}건까지만 보여요. 더 오래된 건은 제목이나 가맹점으로 찾아 주세요.
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0 items-center gap-2 sm:justify-between">
          <p className="text-footnote tabular-nums text-[var(--apple-secondary-label)]" aria-live="polite">
            {selected.size === 0
              ? "이을 비용을 골라 주세요"
              : `${selected.size}건 선택 · ${formatKRW(selectedSum)}${selected.size >= MAX_LINK_SELECT ? " (최대)" : ""}`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="lg" onClick={() => handleOpenChange(false)} disabled={linking}>
              닫기
            </Button>
            <Button type="button" size="lg" onClick={() => void handleLink()} disabled={selected.size === 0 || linking}>
              <Link2 className="size-4" aria-hidden="true" />
              {linking ? "연결 중..." : selected.size > 1 ? `${selected.size}건 연결` : "연결"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
