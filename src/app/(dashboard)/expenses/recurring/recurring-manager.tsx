"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Pause, Play, CalendarClock, Pencil, Paperclip, BellRing } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RecurringListItem } from "@/services/recurring-expense.service";
import { RecurringDialog, type CompanyOption } from "./recurring-dialog";

interface Props {
  rows: RecurringListItem[];
  companies: CompanyOption[];
  categories: { value: string; label: string }[];
  defaultCompanyId: string | null;
  isAdmin: boolean;
  /** "yyyy-mm-dd" (KST) */
  today: string;
  focusId: string | null;
}

interface Reminder {
  occurrenceId: string;
  recurringId: string;
  occurrenceDate: string;
}

function won(n: number) {
  return `${n.toLocaleString("ko-KR")}원`;
}
function ymd(s: string) {
  return s.replaceAll("-", ".");
}
function koDay(s: string) {
  const [, m, d] = s.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

const MODE_CHIP = {
  REMIND: "금액 확인 알림",
  AUTO: "자동 제출",
  NONE: "계획에만",
} as const;

// ---------------------------------------------------------------------------
// 반복 지급 관리 — 올릴 차례 / 목록 / 등록·수정 다이얼로그
// ---------------------------------------------------------------------------
export function RecurringManager({ rows, companies, categories, defaultCompanyId, isAdmin, today, focusId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringListItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [deleting, setDeleting] = useState<RecurringListItem | null>(null);
  const [highlight, setHighlight] = useState<string | null>(focusId);
  const focusRef = useRef<HTMLDivElement | null>(null);

  const refresh = () => startTransition(() => router.refresh());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/recurring-expenses/reminders")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.data) setReminders(j.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!focusId) return;
    focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlight(null), 3000);
    return () => clearTimeout(t);
  }, [focusId]);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(r: RecurringListItem) {
    setEditing(r);
    setDialogOpen(true);
  }
  // 새로고침 후에도 수정 중인 행이 최신 값이도록 id 로 다시 찾는다.
  const editingRow = editing ? (rows.find((r) => r.id === editing.id) ?? editing) : null;

  async function toggleActive(row: RecurringListItem) {
    setBusy(row.id);
    try {
      const res = await fetch(`/api/recurring-expenses/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error?.message ?? "변경하지 못했어요.");
      toast.success(row.isActive ? "일시중지했어요" : "다시 시작해요");
      const sync = j?.data?.planSync;
      if (sync && "error" in sync && sync.error) toast.warning(String(sync.error));
      else if (sync && typeof sync.skipped === "string" && sync.skipped)
        toast.warning(`비용계획에 깔지 못했어요: ${sync.skipped}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "변경하지 못했어요.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: RecurringListItem) {
    setBusy(row.id);
    try {
      const res = await fetch(`/api/recurring-expenses/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? "삭제하지 못했어요.");
      }
      toast.success("반복 지급을 삭제했어요");
      setDeleting(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제하지 못했어요.");
    } finally {
      setBusy(null);
    }
  }

  const titleOf = (id: string) => rows.find((r) => r.id === id)?.title ?? "반복 지급";

  return (
    <div className="flex flex-col gap-4">
      {/* 올릴 차례 */}
      {reminders.length > 0 && (
        <section className="glass flex flex-col gap-2 p-3 sm:p-4" aria-label="올릴 차례">
          <h2 className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--apple-label)]">
            <BellRing className="size-4 text-[var(--apple-orange)]" />
            올릴 차례
          </h2>
          {reminders.map((m) => (
            <div key={m.occurrenceId} className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 text-[14px] text-[var(--apple-label)]">
                {koDay(m.occurrenceDate)} · {titleOf(m.recurringId)}
              </span>
              <Link
                href={`/expenses/new/deposit-request?occurrence=${m.occurrenceId}`}
                className="inline-flex h-9 shrink-0 items-center rounded-full bg-[var(--apple-blue)] px-4 text-[13px] font-medium text-white apple-press"
              >
                입금요청 올리기
              </Link>
            </div>
          ))}
        </section>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={openNew}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--apple-blue)] px-4 text-sm font-medium text-white apple-press"
        >
          <Plus className="size-4" /> 반복 지급 추가
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="glass p-8 text-center">
          <p className="text-sm text-[var(--apple-secondary-label)]">등록된 반복 지급이 없어요.</p>
          <p className="mt-1 text-xs text-[var(--apple-tertiary-label)]">
            월세·구독료처럼 매달 나가는 돈을 한 번 등록하면 비용계획에 미리 깔리고, 날짜가 되면 입금요청을 올리라고 알려 드려요.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const ended = !r.isActive && !!r.endsOn && r.endsOn < today;
            const estimate = r.requestMode !== "AUTO";
            const focused = highlight === r.id;
            return (
              <div
                key={r.id}
                ref={r.id === focusId ? focusRef : undefined}
                className={`glass flex flex-col gap-3 p-3 transition-shadow sm:p-4 ${
                  r.isActive ? "" : "opacity-60"
                } ${focused ? "ring-2 ring-[var(--apple-blue)]" : ""}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-[var(--apple-label)]">{r.title}</span>
                    <span className="tabular-nums text-[var(--apple-secondary-label)]">
                      {estimate ? "예상 " : ""}
                      {won(r.amount)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="glass-badge glass-badge-blue">{MODE_CHIP[r.requestMode]}</span>
                    {r.planProjectName && (
                      <span className="glass-badge">비용계획 · {r.planProjectName}</span>
                    )}
                    {ended ? (
                      <span className="glass-badge">끝남</span>
                    ) : (
                      !r.isActive && <span className="glass-badge">일시중지</span>
                    )}
                    {r.requestMode === "AUTO" && r.attachmentCount > 0 && (
                      <span className="glass-badge inline-flex items-center gap-1">
                        <Paperclip className="size-3" />
                        {r.attachmentCount}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] text-[var(--apple-secondary-label)]">
                    {r.scheduleLabel}
                    {r.companyName ? ` · ${r.companyName}` : ""}
                    {isAdmin && r.submitterName ? ` · ${r.submitterName}` : ""}
                    {r.endsOn ? ` · ${ymd(r.endsOn)} 끝` : ""}
                  </p>
                  {r.isActive && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--apple-blue)]">
                      <CalendarClock className="size-3.5" />
                      다음 예정 {ymd(r.nextRunDate)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEdit(r)}
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--apple-separator)] px-3 text-[13px] text-[var(--apple-label)]"
                  >
                    <Pencil className="size-3.5" /> 수정
                  </button>
                  {ended ? (
                    <span className="text-[12px] text-[var(--apple-secondary-label)]">
                      끝남 — 끝나는 날을 바꾸면 다시 시작할 수 있어요
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === r.id || pending}
                      onClick={() => toggleActive(r)}
                      className="inline-flex h-9 items-center gap-1 rounded-full border border-[var(--apple-separator)] px-3 text-[13px] text-[var(--apple-secondary-label)] disabled:opacity-50"
                    >
                      {r.isActive ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                      {r.isActive ? "일시중지" : "재개"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy === r.id || pending}
                    onClick={() => setDeleting(r)}
                    className="ml-auto inline-flex h-9 items-center gap-1 rounded-full border border-[var(--apple-separator)] px-3 text-[13px] text-[var(--apple-red)] disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" /> 삭제
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RecurringDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        row={editingRow}
        companies={companies}
        categories={categories}
        defaultCompanyId={defaultCompanyId}
        onSaved={refresh}
      />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleting?.title} 삭제</DialogTitle>
            <DialogDescription>
              이미 올린 입금요청과 사람이 손댄 계획은 남고, 앞으로 깔릴 계획은 지워집니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy === deleting?.id}
              onClick={() => deleting && remove(deleting)}
              className="h-11 flex-1 rounded-full bg-[var(--apple-red)] px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              삭제
            </button>
            <button
              type="button"
              onClick={() => setDeleting(null)}
              className="h-11 rounded-full px-4 text-sm text-[var(--apple-secondary-label)]"
            >
              취소
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
