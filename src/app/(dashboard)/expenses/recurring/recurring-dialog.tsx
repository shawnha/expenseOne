"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CompanySelector } from "@/components/forms/company-selector";
import { describeSchedule } from "@/lib/recurring-schedule";
import type { RecurringListItem } from "@/services/recurring-expense.service";
import { RecurringAttachments } from "./recurring-attachments";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type Mode = "REMIND" | "AUTO" | "NONE";
type Precision = "DAY" | "MONTH_EARLY" | "MONTH_MID" | "MONTH";
type Freq = "WEEKLY" | "MONTHLY" | "YEARLY";

export interface CompanyOption {
  id: string;
  name: string;
  slug: string;
  currency: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 있으면 수정, 없으면 새로 등록 */
  row: RecurringListItem | null;
  companies: CompanyOption[];
  categories: { value: string; label: string }[];
  defaultCompanyId: string | null;
  onSaved: () => void;
}

interface FormState {
  title: string;
  description: string;
  amount: string;
  companyId: string;
  frequency: Freq;
  intervalCount: number;
  dayOfMonth: number;
  monthOfYear: number;
  weekday: number;
  startsOn: string;
  endsMode: "none" | "date";
  endsOn: string;
  requestMode: Mode;
  category: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  planOn: boolean;
  planProjectId: string;
  planBrandId: string;
  planDatePrecision: Precision;
  dueDateOffsetDays: string;
}

const MODES: { value: Mode; title: string; desc: string }[] = [
  { value: "REMIND", title: "금액 확인 후 직접 올리기", desc: "날짜가 되면 알려 드리고, 미리 채운 입금요청 폼을 열어 드려요. 금액이 매달 달라도 괜찮아요." },
  { value: "AUTO", title: "같은 금액으로 자동 제출", desc: "예정일에 이 금액 그대로 입금요청이 자동으로 올라가요." },
  { value: "NONE", title: "입금요청 없이 비용계획에만", desc: "법인카드·자동이체처럼 요청이 필요 없는 건. 비용계획에만 표시해요." },
];

const PRECISIONS: { value: Precision; label: string }[] = [
  { value: "DAY", label: "그날" },
  { value: "MONTH_EARLY", label: "월 초" },
  { value: "MONTH_MID", label: "월 중순" },
  { value: "MONTH", label: "월 말" },
];

function digitsOnly(v: string) {
  return v.replace(/\D/g, "");
}

function initialForm(row: RecurringListItem | null, defaultCompanyId: string | null, companies: CompanyOption[], categories: { value: string }[]): FormState {
  if (!row) {
    return {
      title: "",
      description: "",
      amount: "",
      companyId: defaultCompanyId ?? companies[0]?.id ?? "",
      frequency: "MONTHLY",
      intervalCount: 1,
      dayOfMonth: 25,
      monthOfYear: 1,
      weekday: 1,
      startsOn: "",
      endsMode: "none",
      endsOn: "",
      requestMode: "REMIND",
      category: categories[0]?.value ?? "",
      bankName: "",
      accountHolder: "",
      accountNumber: "",
      planOn: false,
      planProjectId: "",
      planBrandId: "",
      planDatePrecision: "MONTH",
      dueDateOffsetDays: "",
    };
  }
  return {
    title: row.title,
    description: row.description ?? "",
    amount: String(row.amount),
    companyId: row.companyId,
    frequency: row.frequency as Freq,
    intervalCount: row.intervalCount,
    dayOfMonth: row.dayOfMonth ?? 25,
    monthOfYear: row.monthOfYear ?? 1,
    weekday: row.weekday ?? 1,
    startsOn: row.startsOn ?? "",
    endsMode: row.endsOn ? "date" : "none",
    endsOn: row.endsOn ?? "",
    requestMode: row.requestMode,
    category: row.category ?? "",
    bankName: row.bankName ?? "",
    accountHolder: row.accountHolder ?? "",
    accountNumber: row.accountNumber ?? "",
    planOn: !!row.planProjectId,
    planProjectId: row.planProjectId ?? "",
    planBrandId: row.planBrandId ?? "",
    planDatePrecision: (row.planDatePrecision as Precision) ?? "MONTH",
    dueDateOffsetDays: row.dueDateOffsetDays == null ? "" : String(row.dueDateOffsetDays),
  };
}

function toPayload(f: FormState) {
  const planned = f.requestMode === "NONE" || f.planOn;
  return {
    title: f.title.trim(),
    description: f.description.trim() || null,
    amount: Number(digitsOnly(f.amount)) || 0,
    companyId: f.companyId,
    frequency: f.frequency,
    intervalCount: f.intervalCount,
    dayOfMonth: f.frequency === "WEEKLY" ? null : f.dayOfMonth,
    monthOfYear: f.frequency === "YEARLY" ? f.monthOfYear : null,
    weekday: f.frequency === "WEEKLY" ? f.weekday : null,
    startsOn: f.startsOn || null,
    endsOn: f.endsMode === "date" && f.endsOn ? f.endsOn : null,
    requestMode: f.requestMode,
    category: f.category.trim() || null,
    bankName: f.bankName.trim() || null,
    accountHolder: f.accountHolder.trim() || null,
    accountNumber: digitsOnly(f.accountNumber) || null,
    planProjectId: planned && f.planProjectId ? f.planProjectId : null,
    planBrandId: planned && f.planProjectId && f.planBrandId ? f.planBrandId : null,
    planDatePrecision: f.planDatePrecision,
    dueDateOffsetDays: f.dueDateOffsetDays === "" ? null : Number(f.dueDateOffsetDays),
  };
}

interface ProjectOpt { id: string; name: string }
interface BrandOpt { id: string; name: string }

const labelCls = "mb-1 block text-[13px] text-[var(--apple-secondary-label)]";
const fieldCls = "glass-input h-11 w-full rounded-xl px-3 text-[15px]";
const selCls = "glass-input h-11 rounded-xl px-3 text-[15px]";

function Req() {
  return <span className="text-[var(--apple-red)]"> *</span>;
}

export function RecurringDialog({ open, onOpenChange, row, companies, categories, defaultCompanyId, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(() => initialForm(row, defaultCompanyId, companies, categories));
  const [saving, setSaving] = useState(false);
  const [planAvail, setPlanAvail] = useState<"loading" | "on" | "off">("loading");
  const [projects, setProjects] = useState<ProjectOpt[]>([]);
  const [brands, setBrands] = useState<BrandOpt[]>([]);

  // 열 때마다 대상 행 기준으로 다시 채운다.
  useEffect(() => {
    if (open) setForm(initialForm(row, defaultCompanyId, companies, categories));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  // 회사별 프로젝트·분류. 404 면 비용계획 스위치가 꺼진 사람 -> 섹션 전체 숨김.
  useEffect(() => {
    if (!open || !form.companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/plans/projects?companyId=${form.companyId}`);
        if (cancelled) return;
        if (res.status === 404) return setPlanAvail("off");
        if (!res.ok) throw new Error();
        const j = await res.json();
        setProjects((j.data?.projects ?? []).map((p: ProjectOpt) => ({ id: p.id, name: p.name })));
        setPlanAvail("on");
        const br = await fetch(`/api/plans/brands?companyId=${form.companyId}`);
        if (!cancelled && br.ok) {
          const bj = await br.json();
          setBrands((bj.data?.brands ?? []).map((b: BrandOpt) => ({ id: b.id, name: b.name })));
        } else if (!cancelled) setBrands([]);
      } catch {
        if (!cancelled) {
          setProjects([]);
          setBrands([]);
          setPlanAvail("on");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, form.companyId]);

  const preview = useMemo(
    () =>
      describeSchedule({
        frequency: form.frequency,
        intervalCount: form.intervalCount,
        dayOfMonth: form.dayOfMonth,
        monthOfYear: form.monthOfYear,
        weekday: form.weekday,
      }),
    [form.frequency, form.intervalCount, form.dayOfMonth, form.monthOfYear, form.weekday],
  );

  const isAuto = form.requestMode === "AUTO";
  const isNone = form.requestMode === "NONE";
  const showPlan = planAvail === "on";
  const planOn = isNone || form.planOn;

  async function save() {
    const p = toPayload(form);
    if (!p.title) return toast.error("제목을 입력해주세요.");
    if (p.amount <= 0) return toast.error("금액을 입력해주세요.");
    if (!p.companyId) return toast.error("회사를 골라주세요.");
    if (isAuto && (!p.category || !p.bankName || !p.accountHolder || !p.accountNumber))
      return toast.error("자동 제출은 카테고리와 은행·예금주·계좌번호가 모두 필요해요.");
    if (isNone && !p.planProjectId) return toast.error("비용계획에만 표시하려면 프로젝트를 골라주세요.");
    if (form.endsMode === "date" && !form.endsOn) return toast.error("끝나는 날을 골라주세요.");

    let body: Record<string, unknown> = p;
    if (row) {
      const before = toPayload(initialForm(row, defaultCompanyId, companies, categories));
      const changed: Record<string, unknown> = {};
      for (const k of Object.keys(p) as (keyof typeof p)[]) {
        if (p[k] !== before[k]) changed[k] = p[k];
      }
      const scheduleKeys = ["frequency", "intervalCount", "dayOfMonth", "monthOfYear", "weekday"] as const;
      if (scheduleKeys.some((k) => k in changed)) for (const k of scheduleKeys) changed[k] = p[k];
      if (Object.keys(changed).length === 0) {
        onOpenChange(false);
        return;
      }
      body = changed;
    }

    setSaving(true);
    try {
      const res = await fetch(row ? `/api/recurring-expenses/${row.id}` : "/api/recurring-expenses", {
        method: row ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error?.message ?? "저장하지 못했어요.");
      toast.success(row ? "저장했어요" : "반복 지급을 등록했어요");
      const sync = j?.data?.planSync;
      if (sync && "error" in sync && sync.error) toast.warning(String(sync.error));
      else if (sync && typeof sync.skipped === "string" && sync.skipped)
        toast.warning(`비용계획에 깔지 못했어요: ${sync.skipped}`);
      else if (sync && typeof sync.created === "number" && sync.created > 0)
        toast.success(`비용계획에 ${sync.created}건 깔았어요`);
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-3 overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{row ? "반복 지급 수정" : "반복 지급 등록"}</DialogTitle>
          <DialogDescription>매달 나가는 돈을 한 번 등록해 두세요.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls}>제목<Req /></label>
            <input className={fieldCls} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="예) 사무실 월세" />
          </div>
          <div>
            <label className={labelCls}>{isAuto ? "금액(원)" : "예상 금액(원)"}<Req /></label>
            <input
              className={`${fieldCls} tabular-nums`}
              inputMode="numeric"
              value={form.amount ? Number(digitsOnly(form.amount)).toLocaleString("ko-KR") : ""}
              onChange={(e) => set("amount", digitsOnly(e.target.value))}
              placeholder="0"
            />
          </div>
          <div>
            <label className={labelCls}>납입 기일 (선택)</label>
            <input
              className={`${fieldCls} tabular-nums`}
              inputMode="numeric"
              value={form.dueDateOffsetDays}
              onChange={(e) => set("dueDateOffsetDays", digitsOnly(e.target.value).slice(0, 2))}
              placeholder="예정일 며칠 뒤"
            />
          </div>
          {companies.length > 1 && (
            <div className="sm:col-span-2">
              <label className={labelCls}>회사</label>
              <CompanySelector
                value={form.companyId}
                initialCompanies={companies}
                userCompanyId={defaultCompanyId}
                onChange={(id) =>
                  setForm((f) => (f.companyId === id ? f : { ...f, companyId: id, planProjectId: "", planBrandId: "" }))
                }
              />
            </div>
          )}
        </div>

        {/* 주기 */}
        <div className="rounded-xl bg-[var(--apple-tertiary-system-fill)] p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className={labelCls}>주기</label>
              <select className={selCls} value={form.frequency} onChange={(e) => set("frequency", e.target.value as Freq)}>
                <option value="MONTHLY">매달</option>
                <option value="WEEKLY">매주</option>
                <option value="YEARLY">매년</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>간격</label>
              <select className={selCls} value={form.intervalCount} onChange={(e) => set("intervalCount", Number(e.target.value))}>
                {[1, 2, 3, 4, 6, 12].map((n) => (
                  <option key={n} value={n}>
                    {n === 1
                      ? form.frequency === "WEEKLY" ? "매주" : form.frequency === "MONTHLY" ? "매달" : "매년"
                      : `${n}${form.frequency === "WEEKLY" ? "주" : form.frequency === "MONTHLY" ? "개월" : "년"}마다`}
                  </option>
                ))}
              </select>
            </div>
            {form.frequency === "WEEKLY" ? (
              <div>
                <label className={labelCls}>요일</label>
                <select className={selCls} value={form.weekday} onChange={(e) => set("weekday", Number(e.target.value))}>
                  {WEEKDAYS.map((w, i) => (
                    <option key={i} value={i}>{w}요일</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                {form.frequency === "YEARLY" && (
                  <div>
                    <label className={labelCls}>월</label>
                    <select className={selCls} value={form.monthOfYear} onChange={(e) => set("monthOfYear", Number(e.target.value))}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>{m}월</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className={labelCls}>며칠</label>
                  <select className={selCls} value={form.dayOfMonth} onChange={(e) => set("dayOfMonth", Number(e.target.value))}>
                    {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>{d}일</option>
                    ))}
                    <option value={31}>말일</option>
                  </select>
                </div>
              </>
            )}
          </div>
          <p className="mt-2 text-[13px] text-[var(--apple-blue)]">{preview}</p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <label className={labelCls}>시작일 (선택)</label>
              <input type="date" className={fieldCls} value={form.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
              <p className="mt-1 text-[12px] text-[var(--apple-tertiary-label)]">비우면 다음 회차부터예요.</p>
            </div>
            <div>
              <label className={labelCls}>끝나는 날</label>
              <div className="flex gap-1.5">
                {(["none", "date"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => set("endsMode", m)}
                    className={`h-9 rounded-full px-3 text-[13px] font-medium ${
                      form.endsMode === m
                        ? "bg-[var(--apple-blue)] text-white"
                        : "border border-[var(--apple-separator)] text-[var(--apple-secondary-label)]"
                    }`}
                  >
                    {m === "none" ? "끝 없음" : "날짜 고르기"}
                  </button>
                ))}
              </div>
              {form.endsMode === "date" && (
                <input type="date" className={`${fieldCls} mt-1.5`} value={form.endsOn} onChange={(e) => set("endsOn", e.target.value)} />
              )}
            </div>
          </div>
        </div>

        {/* 처리 방식 */}
        <div>
          <label className={labelCls}>입금요청은 어떻게 할까요?</label>
          <div role="radiogroup" className="flex flex-col gap-2">
            {MODES.filter((m) => m.value !== "NONE" || planAvail === "on" || form.requestMode === "NONE").map((m) => {
              const on = form.requestMode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set("requestMode", m.value)}
                  className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors ${
                    on ? "border-[var(--apple-blue)] bg-[var(--apple-blue)]/10" : "border-[var(--apple-separator)]"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                      on ? "border-[var(--apple-blue)]" : "border-[var(--apple-separator)]"
                    }`}
                  >
                    {on && <span className="size-2 rounded-full bg-[var(--apple-blue)]" />}
                  </span>
                  <span>
                    <span className="block text-[14px] font-medium text-[var(--apple-label)]">{m.title}</span>
                    <span className="block text-[12px] text-[var(--apple-secondary-label)]">{m.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {!isNone && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>카테고리{isAuto && <Req />}</label>
              <select className={fieldCls} value={form.category} onChange={(e) => set("category", e.target.value)}>
                {isAuto ? (
                  <option value="" disabled>카테고리를 골라주세요</option>
                ) : (
                  <option value="">선택 안 함</option>
                )}
                {/* 목록에 없는 값(직접 입력했던 카테고리)도 그대로 보이게 — 없으면 select 가 첫 항목을 보여 줘 다른 값처럼 보인다. */}
                {form.category && !categories.some((c) => c.value === form.category) && (
                  <option value={form.category}>{form.category}</option>
                )}
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>은행{isAuto && <Req />}</label>
              <input className={fieldCls} value={form.bankName} onChange={(e) => set("bankName", e.target.value)} placeholder="국민은행" />
            </div>
            <div>
              <label className={labelCls}>예금주{isAuto && <Req />}</label>
              <input className={fieldCls} value={form.accountHolder} onChange={(e) => set("accountHolder", e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>계좌번호{isAuto && <Req />}</label>
              <input
                className={`${fieldCls} tabular-nums`}
                inputMode="numeric"
                value={form.accountNumber}
                onChange={(e) => set("accountNumber", digitsOnly(e.target.value))}
                placeholder="숫자만 입력"
              />
            </div>
            {!isAuto && (
              <p className="text-[12px] text-[var(--apple-tertiary-label)] sm:col-span-2">
                계좌는 선택이에요. 적어 두면 알림에서 여는 입금요청 폼에 미리 채워져요.
              </p>
            )}
          </div>
        )}

        {/* 비용계획 */}
        {showPlan && (
          <div className="rounded-xl bg-[var(--apple-tertiary-system-fill)] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-medium text-[var(--apple-label)]">비용계획에도 표시</span>
              <button
                type="button"
                role="switch"
                aria-checked={planOn}
                disabled={isNone}
                onClick={() => set("planOn", !form.planOn)}
                className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-60 ${
                  planOn ? "bg-[var(--apple-green)]" : "bg-[var(--apple-separator)]"
                }`}
              >
                <span className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${planOn ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
            {planOn && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>프로젝트{isNone && <Req />}</label>
                  <select className={fieldCls} value={form.planProjectId} onChange={(e) => set("planProjectId", e.target.value)}>
                    <option value="">{isNone ? "프로젝트 선택" : "선택 안 함"}</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>분류 (선택)</label>
                  <select
                    className={fieldCls}
                    value={form.planBrandId}
                    disabled={!form.planProjectId}
                    onChange={(e) => set("planBrandId", e.target.value)}
                  >
                    <option value="">선택 안 함</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>날짜 표시</label>
                  <div className="flex flex-wrap gap-1.5">
                    {PRECISIONS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => set("planDatePrecision", p.value)}
                        className={`h-9 rounded-full px-3 text-[13px] font-medium ${
                          form.planDatePrecision === p.value
                            ? "bg-[var(--apple-blue)] text-white"
                            : "border border-[var(--apple-separator)] text-[var(--apple-secondary-label)]"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <label className={labelCls}>메모 (선택)</label>
          <textarea
            className="glass-input w-full rounded-xl px-3 py-2 text-[15px]"
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        {/* 첨부 */}
        <div>
          <label className={labelCls}>첨부 파일</label>
          {isAuto && (
            <p className="mb-1.5 text-[12px] text-[var(--apple-secondary-label)]">
              자동 제출되는 입금요청에 이 파일들이 복사돼 붙어요.
            </p>
          )}
          {row ? (
            <RecurringAttachments recurringId={row.id} onChanged={onSaved} />
          ) : (
            <p className="text-[13px] text-[var(--apple-tertiary-label)]">
              파일은 저장한 뒤 수정 화면에서 올릴 수 있어요.
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="h-11 flex-1 rounded-full bg-[var(--apple-blue)] px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "저장 중..." : row ? "저장" : "등록"}
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-full px-4 text-sm text-[var(--apple-secondary-label)]"
          >
            취소
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
