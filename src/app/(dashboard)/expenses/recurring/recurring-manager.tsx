"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Pause, Play, CalendarClock } from "lucide-react";
import { describeSchedule } from "@/lib/recurring-schedule";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export interface RecurringRow {
  id: string;
  title: string;
  amount: number;
  category: string;
  bankName: string;
  accountHolder: string;
  frequency: string;
  intervalCount: number;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  weekday: number | null;
  dueDateOffsetDays: number | null;
  attachFiles: boolean;
  isActive: boolean;
  nextRunDate: string;
  companyName: string | null;
  submitterName: string | null;
  scheduleLabel: string;
}

interface CompanyOption {
  id: string;
  name: string;
}

interface Props {
  rows: RecurringRow[];
  companies: CompanyOption[];
  categories: { value: string; label: string }[];
  defaultCompanyId: string | null;
}

function won(n: number) {
  return `${n.toLocaleString("ko-KR")}원`;
}
function ymd(s: string) {
  return s.replaceAll("-", ".");
}
function digitsOnly(v: string) {
  return v.replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
// 반복 입금요청 관리
//
// 등록해두면 예정일에 자동으로 입금요청이 올라간다. 목록의 첫 정보를
// **다음 등록일**로 둔 이유: 이 화면에서 가장 알고 싶은 게 "언제 올라오나"라서다.
// ---------------------------------------------------------------------------
export function RecurringManager({ rows, companies, categories, defaultCompanyId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    amount: "",
    category: categories[0]?.value ?? "OTHER",
    bankName: "",
    accountHolder: "",
    accountNumber: "",
    companyId: defaultCompanyId ?? companies[0]?.id ?? "",
    frequency: "MONTHLY" as "WEEKLY" | "MONTHLY" | "YEARLY",
    intervalCount: 1,
    dayOfMonth: 25,
    monthOfYear: 1,
    weekday: 1,
    dueDateOffsetDays: "" as string,
    description: "",
  });

  const preview = describeSchedule({
    frequency: form.frequency,
    intervalCount: form.intervalCount,
    dayOfMonth: form.dayOfMonth,
    monthOfYear: form.monthOfYear,
    weekday: form.weekday,
  });

  async function submit() {
    const amount = Number(digitsOnly(form.amount)) || 0;
    if (!form.title.trim()) return toast.error("제목을 입력해주세요.");
    if (amount <= 0) return toast.error("금액을 입력해주세요.");
    if (!form.bankName.trim() || !form.accountHolder.trim() || !form.accountNumber.trim())
      return toast.error("입금 계좌 정보를 모두 입력해주세요.");

    setBusy("create");
    try {
      const res = await fetch("/api/recurring-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          amount,
          category: form.category,
          bankName: form.bankName.trim(),
          accountHolder: form.accountHolder.trim(),
          accountNumber: digitsOnly(form.accountNumber),
          companyId: form.companyId,
          frequency: form.frequency,
          intervalCount: form.intervalCount,
          dayOfMonth: form.frequency === "WEEKLY" ? null : form.dayOfMonth,
          monthOfYear: form.frequency === "YEARLY" ? form.monthOfYear : null,
          weekday: form.frequency === "WEEKLY" ? form.weekday : null,
          dueDateOffsetDays: form.dueDateOffsetDays === "" ? null : Number(form.dueDateOffsetDays),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? "등록에 실패했습니다.");
      }
      toast.success("반복 입금요청을 등록했습니다");
      setOpen(false);
      setForm((f) => ({ ...f, title: "", amount: "", description: "" }));
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "등록에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(row: RecurringRow) {
    setBusy(row.id);
    try {
      const res = await fetch(`/api/recurring-expenses/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      if (!res.ok) throw new Error("변경에 실패했습니다.");
      toast.success(row.isActive ? "일시중지했습니다" : "다시 시작합니다");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "변경에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: RecurringRow) {
    setBusy(row.id);
    try {
      const res = await fetch(`/api/recurring-expenses/${row.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제에 실패했습니다.");
      toast.success("반복 설정을 삭제했습니다 (이미 등록된 입금요청은 남습니다)");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  const field = "glass-input h-11 w-full rounded-xl px-3 text-[15px]";
  const label = "mb-1 block text-[13px] text-[var(--apple-secondary-label)]";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--apple-blue)] px-4 text-sm font-medium text-white"
        >
          <Plus className="size-4" /> 반복 항목 추가
        </button>
      </div>

      {open && (
        <div className="glass flex flex-col gap-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label}>제목 <span className="text-[var(--apple-red)]">*</span></label>
              <input
                className={field}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="예) 사무실 월세"
              />
            </div>
            <div>
              <label className={label}>금액 <span className="text-[var(--apple-red)]">*</span></label>
              <input
                className={`${field} tabular-nums`}
                inputMode="numeric"
                value={form.amount ? Number(digitsOnly(form.amount)).toLocaleString("ko-KR") : ""}
                onChange={(e) => setForm({ ...form, amount: digitsOnly(e.target.value) })}
                placeholder="0"
              />
            </div>
            <div>
              <label className={label}>카테고리</label>
              <select
                className={field}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>회사</label>
              <select
                className={field}
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>은행 <span className="text-[var(--apple-red)]">*</span></label>
              <input
                className={field}
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                placeholder="국민은행"
              />
            </div>
            <div>
              <label className={label}>예금주 <span className="text-[var(--apple-red)]">*</span></label>
              <input
                className={field}
                value={form.accountHolder}
                onChange={(e) => setForm({ ...form, accountHolder: e.target.value })}
              />
            </div>
            <div>
              <label className={label}>계좌번호 <span className="text-[var(--apple-red)]">*</span></label>
              <input
                className={`${field} tabular-nums`}
                inputMode="numeric"
                value={form.accountNumber}
                onChange={(e) => setForm({ ...form, accountNumber: digitsOnly(e.target.value) })}
                placeholder="숫자만 입력"
              />
            </div>
          </div>

          {/* 주기 */}
          <div className="rounded-xl bg-[var(--apple-system-grouped-background)]/50 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className={label}>주기</label>
                <select
                  className="glass-input h-11 rounded-xl px-3 text-[15px]"
                  value={form.frequency}
                  onChange={(e) =>
                    setForm({ ...form, frequency: e.target.value as typeof form.frequency })
                  }
                >
                  <option value="WEEKLY">매주</option>
                  <option value="MONTHLY">매월</option>
                  <option value="YEARLY">매년</option>
                </select>
              </div>
              <div>
                <label className={label}>간격</label>
                <select
                  className="glass-input h-11 rounded-xl px-3 text-[15px]"
                  value={form.intervalCount}
                  onChange={(e) => setForm({ ...form, intervalCount: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 6, 12].map((n) => (
                    <option key={n} value={n}>
                      {n === 1
                        ? "매"
                        : `${n}${form.frequency === "WEEKLY" ? "주" : form.frequency === "MONTHLY" ? "개월" : "년"}마다`}
                    </option>
                  ))}
                </select>
              </div>
              {form.frequency === "WEEKLY" ? (
                <div>
                  <label className={label}>요일</label>
                  <select
                    className="glass-input h-11 rounded-xl px-3 text-[15px]"
                    value={form.weekday}
                    onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}
                  >
                    {WEEKDAYS.map((w, i) => (
                      <option key={i} value={i}>{w}요일</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  {form.frequency === "YEARLY" && (
                    <div>
                      <label className={label}>월</label>
                      <select
                        className="glass-input h-11 rounded-xl px-3 text-[15px]"
                        value={form.monthOfYear}
                        onChange={(e) => setForm({ ...form, monthOfYear: Number(e.target.value) })}
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <option key={m} value={m}>{m}월</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className={label}>일자</label>
                    <select
                      className="glass-input h-11 rounded-xl px-3 text-[15px]"
                      value={form.dayOfMonth}
                      onChange={(e) => setForm({ ...form, dayOfMonth: Number(e.target.value) })}
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>{d}일</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div>
                <label className={label}>납입 기일 (선택)</label>
                <input
                  className="glass-input h-11 w-32 rounded-xl px-3 text-[15px] tabular-nums"
                  inputMode="numeric"
                  value={form.dueDateOffsetDays}
                  onChange={(e) =>
                    setForm({ ...form, dueDateOffsetDays: digitsOnly(e.target.value).slice(0, 2) })
                  }
                  placeholder="며칠 뒤"
                />
              </div>
            </div>
            <p className="mt-2 text-[13px] text-[var(--apple-blue)]">
              → {preview}에 입금요청이 자동으로 등록됩니다.
              {form.dayOfMonth > 28 && form.frequency !== "WEEKLY" && (
                <span className="text-[var(--apple-secondary-label)]">
                  {" "}(그 달에 없는 날이면 말일에 등록)
                </span>
              )}
            </p>
          </div>

          <div>
            <label className={label}>메모 (선택)</label>
            <textarea
              className="glass-input w-full rounded-xl px-3 py-2 text-[15px]"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy === "create"}
              onClick={submit}
              className="h-10 flex-1 rounded-full bg-[var(--apple-blue)] px-4 text-sm font-medium text-white disabled:opacity-50"
            >
              등록
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-10 rounded-full px-4 text-sm text-[var(--apple-secondary-label)]"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="glass p-8 text-center">
          <p className="text-sm text-[var(--apple-secondary-label)]">
            등록된 반복 항목이 없습니다.
          </p>
          <p className="mt-1 text-xs text-[var(--apple-tertiary-label)]">
            월세·구독료처럼 매번 같은 내용으로 올리는 입금요청을 등록해두세요.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className={`glass flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 ${
                r.isActive ? "" : "opacity-60"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-[var(--apple-label)]">{r.title}</span>
                  <span className="tabular-nums text-[var(--apple-secondary-label)]">
                    {won(r.amount)}
                  </span>
                  {!r.isActive && <span className="glass-badge">일시중지</span>}
                  {r.attachFiles && <span className="glass-badge glass-badge-blue">증빙 자동첨부</span>}
                </div>
                <p className="mt-0.5 text-[13px] text-[var(--apple-secondary-label)]">
                  {r.scheduleLabel} · {r.bankName} {r.accountHolder}
                  {r.companyName ? ` · ${r.companyName}` : ""}
                  {r.submitterName ? ` · ${r.submitterName}` : ""}
                </p>
                {r.isActive && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--apple-blue)]">
                    <CalendarClock className="size-3.5" />
                    다음 등록 {ymd(r.nextRunDate)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy === r.id || pending}
                  onClick={() => toggleActive(r)}
                  aria-label={r.isActive ? "일시중지" : "다시 시작"}
                  className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--apple-separator)] text-[var(--apple-secondary-label)] disabled:opacity-50"
                >
                  {r.isActive ? <Pause className="size-4" /> : <Play className="size-4" />}
                </button>
                <button
                  type="button"
                  disabled={busy === r.id || pending}
                  onClick={() => remove(r)}
                  aria-label="삭제"
                  className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--apple-separator)] text-[var(--apple-red)] disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
