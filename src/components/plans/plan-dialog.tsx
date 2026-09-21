"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CompanyPillGroup } from "@/components/companies/company-pill-group";
import { PLAN_AMOUNT_MAX } from "@/lib/validations/plan";
import type { BrandOption, CompanyOption, ProjectSummary } from "@/services/plan.service";
import { fromISODate, jsonBody, planFetch, toISODate } from "./plan-client";
import { useSubmitLock } from "./use-submit-lock";

// ---------------------------------------------------------------------------
// 계획 추가·수정 다이얼로그. 취소(=status CANCELLED)도 여기서 한다 — 계획을 지우는 길은 없다.
// 카드 메뉴의 '삭제'도 이 취소 흐름이다(initialMode="cancel" 로 확인 화면부터 연다).
//
// 선택지(법인·프로젝트·분류)는 **열릴 때 직접 받아 온다.** 보드가 가진 목록은 화면 필터가
// 걸린 범위라서, 다이얼로그에서 다른 법인을 고르는 순간 그 법인의 프로젝트·분류가 비어 보인다.
//
// "분류" = plan_brands. 표·API 이름은 brand 그대로 두고 화면 말만 바꿨다(제품 개발·마케팅 같은 하위 카테고리).
// ---------------------------------------------------------------------------

/** 분류 미지정(공통). Select 는 빈 문자열을 값으로 쓸 수 없어 따로 표식을 둔다. */
const BRAND_NONE = "__none__";

export interface PlanEditTarget {
  id: string;
  version: number;
  companyId: string;
  companyName: string;
  projectId: string;
  brandId: string | null;
  /** 저장된 분류 이름. 비활성 분류는 목록에 없으므로 이 값으로 표시한다. */
  brandName: string | null;
  title: string;
  amount: number;
  plannedDate: string;
  datePrecision: "DAY" | "MONTH";
  vendorName: string | null;
  description: string | null;
  status: string;
}

interface PlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 주면 수정 모드. 법인은 바꿀 수 없다(서버가 company_id 를 받지 않는다). */
  plan?: PlanEditTarget | null;
  /** 추가 모드에서 처음 고를 법인. 보드 필터가 걸려 있으면 그 법인. */
  defaultCompanyId?: string;
  /** 추가 모드에서 처음 고를 프로젝트(서랍의 '계획 추가'). defaultCompanyId 와 같은 법인이어야 한다. */
  defaultProjectId?: string;
  /** 수정 모드에서 취소 확인 화면부터 열기(카드 메뉴의 '삭제'). */
  initialMode?: "edit" | "cancel";
  /** 저장·취소 뒤. 기본은 화면 새로고침. */
  onSaved?: () => void;
}

interface Options {
  companies: CompanyOption[];
  projects: ProjectSummary[];
  brands: BrandOption[];
  isExecutive: boolean;
}

function formatAmountInput(digits: string): string {
  if (digits === "") return "";
  return Number(digits).toLocaleString("ko-KR");
}

export function PlanDialog({
  open,
  onOpenChange,
  plan = null,
  defaultCompanyId,
  defaultProjectId,
  initialMode = "edit",
  onSaved,
}: PlanDialogProps) {
  const router = useRouter();

  const [options, setOptions] = useState<Options | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);
  // 같은 틱의 두 번째 클릭을 막는다(QA D-04). saving 은 화면용, 이 잠금이 실제 문지기다.
  const withLock = useSubmitLock();

  // 처음 값은 **prop 에서 바로** 읽는다. 이 다이얼로그는 열릴 때 마운트되므로(PlanCreateButton·상세 화면)
  // 열 때마다 새 인스턴스다 — 지난 입력을 지우는 effect 가 필요 없고, 남은 값으로 엉뚱한 계획을
  // 저장하는 사고도 구조적으로 막힌다.
  const [companyId, setCompanyId] = useState(plan?.companyId ?? defaultCompanyId ?? "");
  const [projectId, setProjectId] = useState(plan?.projectId ?? defaultProjectId ?? "");
  const [brandId, setBrandId] = useState<string>(plan?.brandId ?? BRAND_NONE);
  const [title, setTitle] = useState(plan?.title ?? "");
  const [amountText, setAmountText] = useState(plan ? plan.amount.toLocaleString("ko-KR") : "");
  const [date, setDate] = useState<Date | undefined>(
    plan ? fromISODate(plan.plannedDate) : undefined,
  );
  const [precision, setPrecision] = useState<"DAY" | "MONTH">(plan?.datePrecision ?? "DAY");
  const [vendorName, setVendorName] = useState(plan?.vendorName ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [dateOpen, setDateOpen] = useState(false);

  const [newBrand, setNewBrand] = useState<string | null>(null);
  const [addingBrand, setAddingBrand] = useState(false);
  const [cancelMode, setCancelMode] = useState(plan !== null && initialMode === "cancel");
  /** 카드 메뉴의 '삭제'로 들어왔으면 그 말을 그대로 쓴다 — 실제로 하는 일(취소 상태)은 같다. */
  const deleteWording = initialMode === "cancel";
  const [cancelReason, setCancelReason] = useState("");

  // 선택지(법인·프로젝트·분류)는 마운트될 때 한 번.
  useEffect(() => {
    let alive = true;
    void Promise.all([
      planFetch<{ projects: ProjectSummary[]; companies: CompanyOption[]; isExecutive: boolean }>(
        "/api/plans/projects",
      ),
      planFetch<{ brands: BrandOption[] }>("/api/plans/brands"),
    ]).then(([projectsRes, brandsRes]) => {
      if (!alive) return;
      setLoadingOptions(false);
      if (!projectsRes.ok) {
        toast.error(projectsRes.message);
        return;
      }
      setOptions({
        companies: projectsRes.data.companies,
        projects: projectsRes.data.projects,
        brands: brandsRes.ok ? brandsRes.data.brands : [],
        isExecutive: projectsRes.data.isExecutive,
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 참여 중인 프로젝트가 모두 한 법인이면 그 법인이 기본값이다. 첫 출시 대상은 KRW 3법인이라
   * "법인이 하나뿐"인 경우는 없고, 법인 필터는 대표에게만 보여 defaultCompanyId 도 대개 비어 있다 —
   * 그대로 두면 일반 참여자는 **늘 미선택으로 열려** 프로젝트·분류 칸이 비활성으로 죽어 보인다.
   */
  const soleProjectCompanyId = useMemo(() => {
    const ids = new Set((options?.projects ?? []).map((p) => p.companyId));
    return ids.size === 1 ? [...ids][0] : "";
  }, [options]);

  // 상태를 따로 맞추지 않고 **읽는 자리에서 정한다** — 상태를 고치는 effect 를 하나 더 두면
  // 열릴 때마다 렌더가 한 번 더 돌고, 사용자가 고른 값을 덮어쓸 위험이 생긴다.
  const activeCompanyId =
    companyId ||
    (options?.companies.length === 1 ? options.companies[0].id : "") ||
    soleProjectCompanyId;

  const projectsInCompany = useMemo(
    () => (options?.projects ?? []).filter((p) => p.companyId === activeCompanyId),
    [options, activeCompanyId],
  );
  const brandsInCompany = useMemo(
    () => (options?.brands ?? []).filter((b) => b.companyId === activeCompanyId),
    [options, activeCompanyId],
  );

  const handleCompanyChange = useCallback((next: string) => {
    setCompanyId(next);
    // 프로젝트·분류는 법인에 매인다. 남겨 두면 법인이 어긋난 채로 저장 버튼이 눌린다.
    setProjectId("");
    setBrandId(BRAND_NONE);
    setNewBrand(null);
  }, []);

  const amount = Number(amountText.replace(/[^\d]/g, "") || "0");

  /**
   * 분류 트리거 라벨. 목록에서 못 찾았는데 brandId 가 남아 있으면 **'공통'이라고 적으면 안 된다** —
   * 화면은 비워졌다고 말하고 저장은 그 분류를 그대로 유지해 상세와 어긋난다(비활성 분류).
   */
  const projectLabel = projectsInCompany.find((p) => p.id === projectId)?.name;

  const brandLabel =
    brandsInCompany.find((b) => b.id === brandId)?.name ??
    (brandId !== BRAND_NONE && plan?.brandName ? `${plan.brandName} (비활성)` : "공통");

  const handleAddBrand = useCallback(
    () =>
      withLock(async () => {
        const name = (newBrand ?? "").trim();
        if (!name || !activeCompanyId) return;
        setAddingBrand(true);
        const res = await planFetch<{ brand: BrandOption }>(
          "/api/plans/brands",
          jsonBody({ companyId: activeCompanyId, name }),
        );
        setAddingBrand(false);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        const brand = res.data.brand;
        setOptions((prev) => (prev ? { ...prev, brands: [...prev.brands, brand] } : prev));
        setBrandId(brand.id);
        setNewBrand(null);
        toast.success(`'${brand.name}' 분류를 추가했습니다.`);
      }),
    [withLock, newBrand, activeCompanyId],
  );

  const finish = useCallback(
    (message: string) => {
      toast.success(message);
      onOpenChange(false);
      if (onSaved) onSaved();
      else router.refresh();
    },
    [onOpenChange, onSaved, router],
  );

  const handleSubmit = useCallback(
    () =>
      withLock(async () => {
        if (!activeCompanyId) return toast.error("법인을 선택해주세요.");
        if (!projectId) return toast.error("프로젝트를 선택해주세요.");
        if (!title.trim()) return toast.error("제목을 입력해주세요.");
        if (amount <= 0) return toast.error("금액을 입력해주세요.");
        if (amount > PLAN_AMOUNT_MAX) return toast.error("금액이 너무 큽니다.");
        if (!date) return toast.error("예정일을 선택해주세요.");

        const shared = {
          projectId,
          title: title.trim(),
          amount,
          plannedDate: toISODate(date),
          datePrecision: precision,
          brandId: brandId === BRAND_NONE ? null : brandId,
          vendorName: vendorName.trim() || null,
          description: description.trim() || null,
        };

        setSaving(true);
        const res = plan
          ? await planFetch<{ id: string; version: number }>(`/api/plans/items/${plan.id}`, {
              ...jsonBody({ version: plan.version, ...shared }),
              method: "PATCH",
            })
          : await planFetch<{ id: string }>(
              "/api/plans/items",
              jsonBody({ companyId: activeCompanyId, ...shared }),
            );
        setSaving(false);

        if (!res.ok) {
          toast.error(res.message);
          // 낙관적 잠금에 걸렸으면 화면의 version 이 이미 옛것이다. 다시 읽어 와야 다음 시도가 통한다.
          if (res.code === "CONFLICT") router.refresh();
          return;
        }
        finish(plan ? "계획을 수정했습니다." : "계획을 추가했습니다.");
      }),
    [
      withLock, activeCompanyId, projectId, title, amount, date, precision, brandId, vendorName,
      description, plan, router, finish,
    ],
  );

  const handleCancelPlan = useCallback(
    () =>
      withLock(async () => {
        if (!plan) return;
        setSaving(true);
        const res = await planFetch<{ id: string; version: number }>(
          `/api/plans/items/${plan.id}/cancel`,
          jsonBody({ version: plan.version, reason: cancelReason.trim() || null }),
        );
        setSaving(false);
        if (!res.ok) {
          toast.error(res.message);
          if (res.code === "CONFLICT") router.refresh();
          return;
        }
        finish(deleteWording ? "계획을 삭제했습니다(취소 상태로 보관)." : "계획을 취소했습니다.");
      }),
    [withLock, plan, cancelReason, router, finish, deleteWording],
  );

  const dateLabel = !date
    ? "날짜 선택"
    : precision === "MONTH"
      ? `${date.getMonth() + 1}월 말`
      : format(date, "yyyy.MM.dd", { locale: ko });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg max-h-[86dvh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-headline text-[var(--apple-label)]">
            {cancelMode ? (deleteWording ? "계획 삭제" : "계획 취소") : plan ? "계획 수정" : "계획 추가"}
          </DialogTitle>
        </DialogHeader>

        {cancelMode ? (
          <div className="space-y-3">
            <p className="text-footnote text-[var(--apple-secondary-label)] break-keep">
              {deleteWording ? "삭제한" : "취소한"} 계획은 보드와 합계에서 빠지지만 완전히 지워지지는 않습니다(상태:
              취소됨). 필터의 &lsquo;취소 포함&rsquo;을 켜면 다시 볼 수 있고, 사유와 이력도 그대로 남습니다.
              되살리려면 새 계획을 만들어야 합니다.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-cancel-reason" className="text-footnote text-[var(--apple-secondary-label)]">
                사유 <span className="font-normal">(선택)</span>
              </Label>
              <Textarea
                id="plan-cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                maxLength={1000}
                placeholder="왜 취소하는지 적어 두면 이력에 남습니다"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 법인 */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-footnote text-[var(--apple-secondary-label)]">법인</Label>
              {plan ? (
                <p className="text-subheadline text-[var(--apple-label)]">{plan.companyName}</p>
              ) : loadingOptions || !options ? (
                <div className="h-9 w-48 rounded-full bg-[var(--apple-tertiary-system-fill)] animate-pulse" />
              ) : (
                <CompanyPillGroup
                  options={options.companies.map((c) => ({ key: c.id, label: c.name }))}
                  value={activeCompanyId}
                  onChange={handleCompanyChange}
                  ariaLabel="법인 선택"
                />
              )}
            </div>

            {/* 프로젝트 */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-footnote text-[var(--apple-secondary-label)]">프로젝트</Label>
              <Select
                value={projectId || null}
                onValueChange={(v) => setProjectId(v ? String(v) : "")}
                disabled={!activeCompanyId || projectsInCompany.length === 0}
              >
                <SelectTrigger
                  className="w-full data-[size=default]:h-11"
                  // aria-label 은 접근 가능한 이름을 통째로 덮어쓴다. 현재 선택을 라벨에 함께 넣지 않으면
                  // 스크린 리더가 무엇이 골라져 있는지 읽지 못한다(company-pill-group.tsx 와 같은 이유).
                  aria-label={`프로젝트 선택: ${projectLabel ?? "미선택"}`}
                >
                  <SelectValue placeholder="프로젝트 선택">{projectLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projectsInCompany.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeCompanyId && !loadingOptions && projectsInCompany.length === 0 && (
                <p className="text-caption1 text-[var(--apple-secondary-label)]">
                  이 법인에 참여 중인 프로젝트가 없습니다. 먼저 프로젝트를 만들어주세요.
                </p>
              )}
            </div>

            {/* 분류 */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-footnote text-[var(--apple-secondary-label)]">
                분류 <span className="font-normal">(선택)</span>
              </Label>
              <Select value={brandId} onValueChange={(v) => v && setBrandId(String(v))} disabled={!activeCompanyId}>
                <SelectTrigger className="w-full data-[size=default]:h-11" aria-label={`분류 선택: ${brandLabel}`}>
                  <SelectValue placeholder="공통">{brandLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={BRAND_NONE}>공통</SelectItem>
                  {brandsInCompany.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 인라인 분류 추가 — 대표만 */}
              {options?.isExecutive && activeCompanyId && (
                newBrand === null ? (
                  <button
                    type="button"
                    onClick={() => setNewBrand("")}
                    className="self-start inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-caption1 text-[var(--apple-blue)] hover:bg-[var(--apple-blue)]/10 transition-colors"
                  >
                    <Plus className="size-3" aria-hidden="true" />
                    새 분류
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-11"
                      value={newBrand}
                      onChange={(e) => setNewBrand(e.target.value)}
                      maxLength={100}
                      placeholder="새 분류 이름 (예: 제품 개발, 마케팅)"
                      aria-label="새 분류 이름"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddBrand();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleAddBrand()}
                      disabled={addingBrand || !newBrand.trim()}
                    >
                      {addingBrand ? "추가 중" : "추가"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setNewBrand(null)}>
                      취소
                    </Button>
                  </div>
                )
              )}
            </div>

            {/* 제목 */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-title" className="text-footnote text-[var(--apple-secondary-label)]">
                제목
              </Label>
              <Input
                id="plan-title"
                className="h-11"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="예) 9월 인플루언서 캠페인"
              />
            </div>

            {/* 금액 */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-amount" className="text-footnote text-[var(--apple-secondary-label)]">
                금액
              </Label>
              <div className="relative">
                <Input
                  id="plan-amount"
                  value={amountText}
                  inputMode="numeric"
                  placeholder="0"
                  className="h-11 pr-10 tabular-nums"
                  onChange={(e) =>
                    setAmountText(formatAmountInput(e.target.value.replace(/[^\d]/g, "").slice(0, 10)))
                  }
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--apple-secondary-label)]">
                  원
                </span>
              </div>
            </div>

            {/* 예정일 + 월 단위 토글 */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-footnote text-[var(--apple-secondary-label)]">예정일</Label>
                <div
                  className="inline-flex rounded-full border border-[var(--glass-border)] bg-[var(--apple-system-grouped-background)] p-1"
                  role="radiogroup"
                  aria-label="날짜 단위"
                >
                  {(["DAY", "MONTH"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={precision === p}
                      onClick={() => setPrecision(p)}
                      className={cn(
                        // 44px 터치 타깃(DESIGN.md, QA D-08). 컨테이너 p-1 을 더하면 필 높이 52px.
                        "min-h-11 rounded-full px-4 text-caption1 font-medium transition-all duration-200",
                        precision === p
                          ? "bg-[var(--apple-blue)] text-white shadow-[0_1px_4px_rgba(0,122,255,0.25)]"
                          : "text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)]",
                      )}
                    >
                      {p === "DAY" ? "일 단위" : "월 단위"}
                    </button>
                  ))}
                </div>
              </div>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger
                  className={cn(
                    "flex h-11 w-full items-center justify-start gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 text-sm transition-colors hover:bg-[rgba(0,0,0,0.03)] dark:hover:bg-[rgba(255,255,255,0.05)]",
                    !date && "text-[var(--apple-secondary-label)]",
                  )}
                  aria-label={`예정일: ${dateLabel}`}
                >
                  <CalendarIcon className="size-4 text-[var(--apple-secondary-label)]" aria-hidden="true" />
                  <span className="tabular-nums">{dateLabel}</span>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                      setDate(d ?? undefined);
                      setDateOpen(false);
                    }}
                    locale={ko}
                  />
                </PopoverContent>
              </Popover>
              {precision === "MONTH" && (
                <p className="text-caption1 text-[var(--apple-secondary-label)]">
                  월 단위로 저장하면 고른 달의 말일로 잡히고, 화면에는 &lsquo;N월 말&rsquo;로 보입니다.
                </p>
              )}
            </div>

            {/* 거래처 */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-vendor" className="text-footnote text-[var(--apple-secondary-label)]">
                거래처 <span className="font-normal">(선택)</span>
              </Label>
              <Input
                id="plan-vendor"
                className="h-11"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                maxLength={200}
                placeholder="예) 한아원 스튜디오"
              />
            </div>

            {/* 설명 */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="plan-desc" className="text-footnote text-[var(--apple-secondary-label)]">
                설명 <span className="font-normal">(선택)</span>
              </Label>
              <Textarea
                id="plan-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={4000}
                placeholder="무엇에 쓰는 돈인지 적어 두세요"
              />
            </div>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          {/* 취소(계획 폐기)는 수정 모드에서만, 예정 상태일 때만 */}
          {plan && !cancelMode && plan.status === "PLANNED" ? (
            <Button
              type="button"
              variant="destructive"
              size="lg"
              onClick={() => setCancelMode(true)}
              disabled={saving}
            >
              계획 취소
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => (cancelMode ? setCancelMode(false) : onOpenChange(false))}
              disabled={saving}
            >
              {cancelMode ? "돌아가기" : "닫기"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant={cancelMode ? "destructive" : "default"}
              onClick={() => void (cancelMode ? handleCancelPlan() : handleSubmit())}
              disabled={saving || (!cancelMode && (loadingOptions || !options))}
            >
              {saving ? "저장 중..." : cancelMode ? (deleteWording ? "삭제하기" : "계획 취소하기") : plan ? "저장" : "추가"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 버튼 + 다이얼로그를 한 덩어리로. 서버 컴포넌트(보드·빈 상태)에서 바로 쓴다.
// ---------------------------------------------------------------------------

export function PlanCreateButton({
  label = "계획 추가",
  defaultCompanyId,
  defaultProjectId,
  variant = "default",
  size = "lg",
}: {
  label?: string;
  defaultCompanyId?: string;
  defaultProjectId?: string;
  variant?: "default" | "outline";
  size?: "lg" | "sm";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        className={size === "sm" ? "min-h-11" : undefined}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" aria-hidden="true" />
        {label}
      </Button>
      {open && (
        <PlanDialog
          open
          onOpenChange={setOpen}
          defaultCompanyId={defaultCompanyId}
          defaultProjectId={defaultProjectId}
        />
      )}
    </>
  );
}
