"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { CompanySelector } from "@/components/forms/company-selector";
import { PlanLinkedChip, usePreselectedPlan, type PlanPick } from "@/components/forms/plan-pick";
import { CategorySelectField } from "@/components/forms/category-select-field";
import { formatAmount } from "@/lib/validations/expense-form";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useFormBusy } from "@/hooks/use-form-busy";
import { cn } from "@/lib/utils";
import {
  CARD_BATCH_MAX,
  CARD_BATCH_MAX_RANGE_DAYS,
  type CardBatchRequest,
  type CardBatchResponse,
  type PendingCardTx,
  type PendingCardTxList,
} from "@/lib/card-batch/types";
import {
  buildDefaultTitle,
  initialDateRange,
  matchesPendingQuery,
  defaultSelection,
  failedFirst,
  formatMonthDay,
  pickDefaultCompany,
  reapplyPrefix,
  sumSelected,
} from "@/lib/card-batch/ui";

interface CardBatchFormProps {
  planId?: string;
  initialIds?: string[];
  initialCompanies?: { id: string; name: string; slug: string; currency: string }[];
  myCategories?: string[];
  /** 관리자는 주인이 연결되지 않은 카드(공용 카드)의 결제도 불러올 수 있다 */
  isAdmin?: boolean;
  /** 「아직 안 올린 결제 N건」 링크가 준 시작일(YYYY-MM-DD). 검사는 initialDateRange 가 한다 */
  initialFrom?: string;
  /** 비용계획에서 지난 기간 결제를 골라 왔을 때의 종료일(YYYY-MM-DD) */
  initialTo?: string;
}

const TITLE_MAX = 200;
const PREFIX_MAX = 100;
const GENERIC_ERROR = "일시적인 문제로 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";

function rangeError(from: string, to: string): string | null {
  if (!from || !to) return "시작일과 종료일을 선택해주세요.";
  if (from > to) return "시작일을 종료일보다 앞선 날짜로 선택해주세요.";
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (days > CARD_BATCH_MAX_RANGE_DAYS) {
    return `조회 기간은 최대 ${CARD_BATCH_MAX_RANGE_DAYS}일까지 가능합니다.`;
  }
  return null;
}

export default function CardBatchForm({ initialCompanies, myCategories = [], isAdmin = false, initialFrom, initialTo, planId, initialIds }: CardBatchFormProps) {
  // 관리자 전용: 공용 카드(주인 없는 카드) 결제 보기 + 카드 끝 4자리로 좁히기. 불러오기를 눌러야 적용된다.
  const [sharedCards, setSharedCards] = useState(false);
  const [sharedCardLast4, setSharedCardLast4] = useState("");
  const scopeRef = useRef({ unassigned: false, card: "" });
  useEffect(() => {
    scopeRef.current = { unassigned: isAdmin && sharedCards, card: sharedCardLast4 };
  }, [isAdmin, sharedCards, sharedCardLast4]);
  // 기간 — KST 기준 기본값. 서버/클라이언트 시각 차이로 하이드레이션이 어긋나지 않게 초기값은 마운트 때 정한다.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [items, setItems] = useState<PendingCardTx[]>([]);
  const [query, setQuery] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rangeErr, setRangeErr] = useState<string | null>(null);
  const [loadedRange, setLoadedRange] = useState<{ from: string; to: string } | null>(null);
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const [failures, setFailures] = useState<Record<string, string>>({});

  const [prefix, setPrefix] = useState("");
  const activeIds = useMemo(() => initialCompanies?.map((c) => c.id), [initialCompanies]);
  const [companyId, setCompanyId] = useState(
    initialCompanies && initialCompanies.length === 1 ? initialCompanies[0].id : "",
  );
  const [companyTouched, setCompanyTouched] = useState(false);
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [category, setCategory] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [createdTotal, setCreatedTotal] = useState(0);

  // 최신 값을 비동기 콜백에서 읽기 위한 ref
  const prefixRef = useRef(prefix);
  prefixRef.current = prefix;
  const editedRef = useRef(edited);
  editedRef.current = edited;
  const titlesRef = useRef(titles);
  titlesRef.current = titles;
  const companyTouchedRef = useRef(companyTouched);
  companyTouchedRef.current = companyTouched;
  const userCompanyRef = useRef(userCompanyId);
  userCompanyRef.current = userCompanyId;
  const requestSeq = useRef(0);
  const lastRangeRef = useRef<{ from: string; to: string } | null>(null);
  const activeIdsRef = useRef(activeIds);
  activeIdsRef.current = activeIds;
  const listRef = useRef<HTMLDivElement>(null);
  const doneHeadingRef = useRef<HTMLHeadingElement>(null);

  // 전달받은 선택은 첫 조회에만 적용한다. 계획 회사는 **고른 결제의 카드 회사와 부딪히지 않을 때만** 쓴다(아래 효과) —
  // 다른 법인 카드 결제를 계획 회사로 몰래 올리지 않게(리뷰 10-27).
  const [selectedPlan, setSelectedPlan] = useState<PlanPick | null>(null);
  const planCompanyRef = useRef<string | null>(null);
  const initialIdsRef = useRef(initialIds);
  const initialSelectionApplied = useRef(false);
  const [missingCount, setMissingCount] = useState(0);
  usePreselectedPlan(planId, {
    onLoaded: (pick) => {
      setSelectedPlan(pick);
    },
    onMissing: () => toast.error("연결하려던 계획을 불러오지 못했습니다."),
  });

  // 계획 회사로 맞추기 — 처음 고른 결제가 정해진 뒤 한 번만, 사람이 회사를 고르지 않았고 고른 결제의 카드 회사가
  // 모두 비었거나 계획 회사와 같을 때만. 하나라도 다르면 카드 회사를 두고 칩이 경고한다.
  const planCompanyApplied = useRef(false);
  useEffect(() => {
    if (!selectedPlan || planCompanyApplied.current || !initialSelectionApplied.current) return;
    if (companyTouchedRef.current) return;
    const picked = items.filter((x) => selected.has(x.id));
    if (picked.length === 0) return;
    planCompanyApplied.current = true;
    const conflict = picked.some((x) => x.mappedCompanyId && x.mappedCompanyId !== selectedPlan.companyId);
    if (conflict || !(activeIdsRef.current ?? []).includes(selectedPlan.companyId)) return;
    planCompanyRef.current = selectedPlan.companyId;
    setCompanyId(selectedPlan.companyId);
  }, [selectedPlan, items, selected]);

  // 사용자 회사 (기본 회사 폴백)
  useEffect(() => {
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const cid: string | undefined = json?.data?.companyId;
        if (!cid || (activeIdsRef.current && !activeIdsRef.current.includes(cid))) return;
        setUserCompanyId(cid);
        setCompanyId((cur) => (cur || companyTouchedRef.current || planCompanyRef.current ? cur : cid));
      })
      .catch(() => {});
  }, []);

  /**
   * keep=true 는 제출 뒤 동기화용: 선택·실패 문구·손으로 고친 제목을 그대로 두고,
   * 더 이상 대기 중이 아닌 행만 사라지게 한다. 실패해도 화면을 건드리지 않는다.
   */
  const load = useCallback(async (f: string, t: string, keep = false): Promise<PendingCardTx[] | null> => {
    const err = rangeError(f, t);
    if (err) {
      setRangeErr(err);
      return null;
    }
    setRangeErr(null);
    const seq = ++requestSeq.current;
    setLoading(true);
    if (!keep) setLoadError(null);
    try {
      const q = new URLSearchParams({ from: f, to: t });
      if (scopeRef.current.unassigned) {
        q.set("scope", "unassigned");
        if (/^\d{4}$/.test(scopeRef.current.card)) q.set("card", scopeRef.current.card);
      }
      const res = await fetch(`/api/card-transactions/pending?${q.toString()}`);
      const json = await res.json().catch(() => null);
      if (seq !== requestSeq.current) return null;
      if (!res.ok) {
        if (!keep) {
          setLoadError(json?.error?.message ?? GENERIC_ERROR);
          setItems([]);
          setSelected(new Set());
          setFailures({});
          setLoadedRange(null);
        }
        return null;
      }
      const data = json?.data as PendingCardTxList | undefined;
      const list = data?.items ?? [];
      const ids = new Set(list.map((x) => x.id));
      setItems(list);
      setTruncated(!!data?.truncated);
      setLoadedRange({ from: f, to: t });
      lastRangeRef.current = { from: f, to: t };
      if (keep) {
        setSelected((cur) => new Set([...cur].filter((id) => ids.has(id))));
        setFailures((cur) => Object.fromEntries(Object.entries(cur).filter(([id]) => ids.has(id))));
      } else {
        setFailures({});
        setSelectionTouched(false);
        if (!initialSelectionApplied.current && initialIdsRef.current !== undefined) {
          const requested = initialIdsRef.current;
          setSelected(new Set(requested.filter((id) => ids.has(id))));
          setMissingCount(requested.filter((id) => !ids.has(id)).length);
        } else {
          // 최신순 목록의 앞에서 중복을 제외한 최대 건수까지 기본 선택한다.
          setSelected(defaultSelection(list, CARD_BATCH_MAX));
        }
        initialSelectionApplied.current = true;
      }
      // 손으로 고친 제목은 같은 결제가 다시 오면 유지한다.
      const keptEdited = new Set([...editedRef.current].filter((id) => ids.has(id)));
      setEdited(keptEdited);
      const nextTitles: Record<string, string> = {};
      for (const x of list) {
        nextTitles[x.id] = keptEdited.has(x.id) && x.id in titlesRef.current
          ? titlesRef.current[x.id]
          : buildDefaultTitle(prefixRef.current, x.storeName);
      }
      setTitles(nextTitles);
      if (!companyTouchedRef.current && !planCompanyRef.current) {
        const pick = pickDefaultCompany(list, userCompanyRef.current, activeIdsRef.current);
        if (pick) setCompanyId(pick);
      }
      return list;
    } catch {
      if (!keep && seq === requestSeq.current) {
        setLoadError(GENERIC_ERROR);
        setItems([]);
        setSelected(new Set());
        setFailures({});
        setLoadedRange(null);
      }
      return null;
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const r = initialDateRange(new Date(), initialFrom, initialTo);
    setFrom(r.from);
    setTo(r.to);
    load(r.from, r.to);
  }, [load, initialFrom, initialTo]);

  const handlePrefixChange = (value: string) => {
    setPrefix(value);
    setTitles((cur) => reapplyPrefix(items, cur, edited, value));
  };

  const handleTitleChange = (id: string, value: string) => {
    setTitles((cur) => ({ ...cur, [id]: value }));
    setEdited((cur) => new Set(cur).add(id));
  };

  const toggle = (id: string) => {
    setSelectionTouched(true);
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtering = query.trim().length > 0;
  const visibleItems = useMemo(
    () => items.filter((x) => matchesPendingQuery(x, query, titles[x.id])),
    [items, query, titles],
  );
  const allSelected = visibleItems.length > 0 && visibleItems.every((x) => selected.has(x.id));
  const toggleAll = () => {
    setSelectionTouched(true);
    // 검색에 가려진 선택도 제출하므로 보이는 행만 바꾼다.
    setSelected((cur) => {
      const next = new Set(cur);
      for (const x of visibleItems) {
        if (allSelected) next.delete(x.id);
        else next.add(x.id);
      }
      return next;
    });
  };

  const selectedCount = items.filter((x) => selected.has(x.id)).length;
  const hiddenSelectedCount = selectedCount - visibleItems.filter((x) => selected.has(x.id)).length;
  const total = useMemo(() => sumSelected(items, selected), [items, selected]);
  const emptyTitleSelected = items.some((x) => selected.has(x.id) && !(titles[x.id] ?? "").trim());
  const overMax = selectedCount > CARD_BATCH_MAX;

  const titleTooLong = items.some((x) => selected.has(x.id) && (titles[x.id] ?? "").trim().length > TITLE_MAX);
  const stale = !loading && !!loadedRange && (loadedRange.from !== from || loadedRange.to !== to);

  // overMax 만 빨간 경고. 나머지는 아직 입력 전일 수 있어 안내 문구로만 보인다.
  const blockReason = overMax
    ? `한 번에 최대 ${CARD_BATCH_MAX}건까지 올릴 수 있습니다. ${selectedCount - CARD_BATCH_MAX}건을 선택 해제해주세요.`
    : stale
      ? "기간을 바꿨습니다. 불러오기를 눌러주세요."
      : selectedCount > 0 && !category.trim()
        ? "카테고리를 선택해주세요."
        : selectedCount > 0 && !companyId
          ? "회사를 선택해주세요."
          : emptyTitleSelected
            ? "제목이 비어 있는 건이 있습니다. 제목을 입력해주세요."
            : titleTooLong
              ? `제목은 ${TITLE_MAX}자 이내로 입력해주세요.`
              : null;
  const canSubmit = selectedCount > 0 && !blockReason && !submitting && !loading;

  // 사용자가 직접 건드린 것만 '수정됨'으로 본다(기본 선택은 제외).
  const dirty =
    items.length > 0 && (selectionTouched || edited.size > 0 || !!category || !!prefix || companyTouched);
  useUnsavedChanges(dirty || submitting);
  useFormBusy("card-batch", dirty || submitting);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const picked = items.filter((x) => selected.has(x.id));
    const body: CardBatchRequest = {
      companyId,
      // 회사가 다르면 서버가 어차피 잇지 못한다 — 화면 경고와 같게 보내지 않는다.
      ...(selectedPlan && selectedPlan.companyId === companyId ? { planId: selectedPlan.id } : {}),
      category: category.trim(),
      items: picked.map((x) => ({ gowidTxId: x.id, title: (titles[x.id] ?? "").trim() })),
    };
    setSubmitting(true);
    setStatusMessage("올리는 중입니다. 시간이 조금 걸릴 수 있습니다.");
    // 오류·끊김 뒤에는 서버에 이미 올라간 건이 있을 수 있어 대기 목록을 다시 받아 맞춘다.
    const resync = async () => {
      const r = lastRangeRef.current;
      if (!r) return;
      const list = await load(r.from, r.to, true);
      if (!list) return;
      const still = new Set(list.map((x) => x.id));
      const gone = picked.filter((x) => !still.has(x.id)).length;
      if (gone > 0) {
        setCreatedTotal((n) => n + gone);
        toast.info(`${gone}건은 이미 올라가 목록에서 뺐습니다. 남은 건을 확인해주세요.`);
      }
    };
    try {
      const res = await fetch("/api/expenses/card-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) {
        toast.error(json?.error?.message ?? GENERIC_ERROR);
        setStatusMessage(json?.error?.message ?? GENERIC_ERROR);
        await resync();
        return;
      }
      const data = json.data as CardBatchResponse;
      if ((data.planLinked ?? 0) > 0) toast.success(`비용계획에 ${data.planLinked}건을 연결했습니다.`);
      if (data.planLinkError) toast.error(data.planLinkError);
      const okIds = new Set(data.results.filter((r) => r.ok).map((r) => r.gowidTxId));
      const failMap: Record<string, string> = {};
      for (const r of data.results) if (!r.ok) failMap[r.gowidTxId] = r.message;

      if (data.created > 0) toast.success(`${data.created}건을 올렸습니다.`);
      if (data.failed > 0) toast.error(`${data.failed}건은 올리지 못했습니다. 실패한 건을 목록 맨 위에 모았습니다.`);
      setStatusMessage(
        `${data.created}건을 올렸습니다.${data.failed > 0 ? ` ${data.failed}건은 올리지 못했습니다.` : ""}`,
      );

      setCreatedTotal((n) => n + data.created);
      setItems((cur) => cur.filter((x) => !okIds.has(x.id)));
      setSelected((cur) => {
        const next = new Set(cur);
        okIds.forEach((id) => next.delete(id));
        return next;
      });
      setFailures(failMap);
      if (data.failed > 0) {
        await resync();
        setFailures(failMap);
        requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    } catch {
      toast.error(GENERIC_ERROR);
      setStatusMessage(GENERIC_ERROR);
      await resync();
    } finally {
      setSubmitting(false);
    }
  };

  const allDone = createdTotal > 0 && items.length === 0 && !loading;
  const shownItems = useMemo(() => failedFirst(visibleItems, failures), [visibleItems, failures]);

  useEffect(() => {
    if (allDone) doneHeadingRef.current?.focus();
  }, [allDone]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Breadcrumb
        items={[
          { label: "비용 관리", href: "/expenses" },
          { label: "새 비용", href: "/expenses/new" },
          { label: "법카 결제 한 번에 올리기" },
        ]}
      />

      <div className="flex items-center gap-3">
        <Link
          href="/expenses/new"
          className="flex items-center justify-center size-11 rounded-full glass-subtle text-[var(--apple-secondary-label)] hover:text-[var(--apple-label)] transition-colors"
          aria-label="뒤로"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-title3 text-[var(--apple-label)]">법카 결제 한 번에 올리기</h1>
          <p className="text-footnote text-[var(--apple-secondary-label)] mt-0.5">
            출장처럼 결제가 많을 때, 아직 올리지 않은 법카 결제를 골라 한 번에 올립니다.
          </p>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {statusMessage}
      </p>

      {selectedPlan && (
        <PlanLinkedChip
          title={selectedPlan.title}
          onCancel={() => setSelectedPlan(null)}
          warning={selectedPlan.companyId !== companyId ? "계획의 회사와 달라 연결되지 않습니다. 회사를 맞추거나 연결을 해제해주세요." : null}
        />
      )}
      {missingCount > 0 && (
        <p role="status" className="text-footnote text-[var(--apple-secondary-label)]">
          선택한 결제 중 {missingCount}건은 목록에 없습니다(이미 올라갔거나 기간 밖).
        </p>
      )}

      {allDone ? (
        <div className="glass p-8 text-center space-y-4" role="status">
          <CheckCircle2 className="size-12 mx-auto text-[var(--apple-green)]" />
          <div>
            <h2 ref={doneHeadingRef} tabIndex={-1} className="text-subheadline font-semibold text-[var(--apple-label)] outline-none">
              {createdTotal}건을 모두 올렸습니다.
            </h2>
            <p className="text-footnote text-[var(--apple-secondary-label)] mt-1">
              영수증 첨부가 필요한 건은 비용 상세에서 붙일 수 있습니다.
            </p>
          </div>
          <Link href="/expenses" className="block">
            <Button className="w-full sm:w-auto rounded-full h-12 px-8 text-[15px] font-semibold bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)]">
              내 비용 보러 가기
            </Button>
          </Link>
        </div>
      ) : (
        <fieldset disabled={submitting} className="min-w-0 space-y-5 border-0 p-0 m-0">
          {/* 기간 */}
          <div className="glass p-5">
            <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-3">기간</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cb-from">시작일</Label>
                <Input
                  id="cb-from"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-invalid={!!rangeErr}
                  aria-describedby={rangeErr ? "cb-range-err" : undefined}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cb-to">종료일</Label>
                <Input
                  id="cb-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  aria-invalid={!!rangeErr}
                  aria-describedby={rangeErr ? "cb-range-err" : undefined}
                  className="h-11"
                />
              </div>
            </div>
            {rangeErr && (
              <p id="cb-range-err" className="mt-3 text-footnote text-[var(--apple-red)]" role="alert">
                {rangeErr}
              </p>
            )}
            {isAdmin && (
              <div className="mt-3 space-y-2">
                <label className="flex min-h-11 items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={sharedCards}
                    onChange={(e) => setSharedCards(e.target.checked)}
                    className="size-5 rounded-md accent-[var(--apple-blue)]"
                  />
                  <span className="text-[14px] text-[var(--apple-label)]">주인이 연결되지 않은 카드(공용 카드) 결제 보기</span>
                </label>
                {sharedCards && (
                  <div className="space-y-1.5">
                    <Label htmlFor="cb-card">카드 끝 4자리 (선택)</Label>
                    <Input
                      id="cb-card"
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="예: 5477"
                      value={sharedCardLast4}
                      onChange={(e) => setSharedCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      className="h-11 max-w-40"
                    />
                    <p className="text-footnote text-[var(--apple-secondary-label)]">
                      관리자만 보입니다. 올리면 올린 사람(관리자) 이름으로 등록됩니다. 바꾼 뒤 불러오기를 눌러주세요.
                    </p>
                  </div>
                )}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => load(from, to)}
              disabled={loading}
              className="mt-3 w-full sm:w-auto rounded-full h-11 px-6 glass border-[var(--apple-separator)]"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  불러오는 중…
                </>
              ) : (
                "불러오기"
              )}
            </Button>
          </div>

          {/* 공통 설정 */}
          <div className="glass p-5">
            <h2 className="text-subheadline font-semibold text-[var(--apple-label)] mb-1">공통 설정</h2>
            <p className="text-footnote text-[var(--apple-secondary-label)] mb-4">
              선택한 결제 모두에 같은 회사와 카테고리가 적용됩니다.
            </p>
            <div className="space-y-5">
              <div className="space-y-1.5">
                <CompanySelector
                  value={companyId}
                  onChange={(id) => {
                    companyTouchedRef.current = true;
                    setCompanyId(id);
                    setCompanyTouched(true);
                  }}
                  userCompanyId={userCompanyId}
                  initialCompanies={initialCompanies}
                />
                {(initialCompanies?.length ?? 0) >= 2 && (
                <p className="text-footnote text-[var(--apple-secondary-label)]">
                  출장 비용을 다른 법인(예: 한아원파트너스)으로 처리하려면 여기서 바꿔주세요.
                </p>
                )}
              </div>

              <CategorySelectField value={category} onChange={setCategory} myCategories={myCategories} />

              <div className="space-y-1.5">
                <Label htmlFor="cb-prefix">제목 앞머리</Label>
                <Input
                  id="cb-prefix"
                  value={prefix}
                  onChange={(e) => handlePrefixChange(e.target.value)}
                  placeholder="예: [밴쿠버 출장]"
                  maxLength={PREFIX_MAX}
                  className="h-11"
                />
              </div>
            </div>
          </div>

          {/* 결제 목록 */}
          <div ref={listRef} className="glass p-5 scroll-mt-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-subheadline font-semibold text-[var(--apple-label)]">
                올리지 않은 법카 결제
                {items.length > 0 && (
                  <span className="ml-1.5 text-footnote font-normal text-[var(--apple-secondary-label)]">
                    {items.length}건
                  </span>
                )}
              </h2>
              {items.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={toggleAll}
                  disabled={visibleItems.length === 0}
                  className="rounded-full h-11 px-4 text-[13px] text-[var(--apple-blue)]"
                >
                  {filtering ? `보이는 ${visibleItems.length}건 ${allSelected ? "해제" : "선택"}` : allSelected ? "전체 해제" : "전체 선택"}
                </Button>
              )}
            </div>

            <div className="mb-3">
              <Label htmlFor="cb-search" className="sr-only">결제 검색</Label>
              <div className="relative">
                <Input
                  id="cb-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="금액·날짜·가맹점으로 찾기 (예: 12000, 10.24)"
                  className="h-11 pr-12 bg-[var(--apple-secondary-system-background)] backdrop-blur-none [&::-webkit-search-cancel-button]:appearance-none"
                />
                {query && (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="검색어 지우기"
                    onClick={() => setQuery("")}
                    className="absolute right-0 top-0 size-11 rounded-full p-0 text-[var(--apple-secondary-label)]"
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
              {filtering && (
                <div className="mt-2 space-y-1 text-footnote text-[var(--apple-secondary-label)] tabular-nums" role="status">
                  <p>{items.length}건 중 {visibleItems.length}건</p>
                  {hiddenSelectedCount > 0 && (
                    <div className="p-3 rounded-xl bg-[rgba(255,149,0,0.12)] text-[13px] text-[#C93400] dark:text-[#FF9F0A]">
                      <p>선택한 {selectedCount}건 중 {hiddenSelectedCount}건은 검색에 가려져 있어요</p>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setSelectionTouched(true);
                          const visibleIds = new Set(visibleItems.map((x) => x.id));
                          setSelected((cur) => {
                            const next = new Set(cur);
                            for (const x of items) {
                              if (!visibleIds.has(x.id)) next.delete(x.id);
                            }
                            return next;
                          });
                        }}
                        className="mt-1 h-11 rounded-full px-4 text-[13px] text-[#C93400] dark:text-[#FF9F0A]"
                      >
                        가려진 {hiddenSelectedCount}건 선택 해제
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {loadError && (
              <p className="p-3 rounded-xl bg-[rgba(255,59,48,0.08)] text-[13px] text-[var(--apple-red)]" role="alert">
                {loadError}
              </p>
            )}

            {loading && items.length === 0 && !loadError && (
              <div className="py-10 flex items-center justify-center gap-2 text-footnote text-[var(--apple-secondary-label)]">
                <Loader2 className="size-4 animate-spin" />
                결제 내역을 불러오는 중입니다…
              </div>
            )}

            {!loading && !loadError && visibleItems.length === 0 && (
              <p className="py-10 text-center text-footnote text-[var(--apple-secondary-label)]">
                {filtering ? "찾는 결제가 없어요. 기간을 넓혀 보세요." : "이 기간에 아직 올리지 않은 법카 결제가 없습니다."}
              </p>
            )}

            {stale && items.length > 0 && (
              <p className="mb-3 text-footnote text-[var(--apple-secondary-label)]">
                기간을 바꿨습니다. 불러오기를 눌러주세요.
              </p>
            )}

            {items.length > 0 && (
              <ul className={cn("divide-y divide-[var(--apple-separator)]", loading && "opacity-60")}>
                {shownItems.map((x) => {
                  const isOn = selected.has(x.id);
                  const failure = failures[x.id];
                  const label = `${formatMonthDay(x.date)}${x.time ? ` ${x.time}` : ""} ${x.storeName || "가맹점 정보 없음"} ${formatAmount(x.amount)}원`;
                  const cbId = `cb-${x.id}`;
                  const dupId = `cb-dup-${x.id}`;
                  return (
                    <li
                      key={x.id}
                      className={cn(
                        "py-3 transition-opacity",
                        failure && "bg-[rgba(255,59,48,0.06)] -mx-2 px-2 rounded-xl",
                        !isOn && !failure && "opacity-60",
                      )}
                    >
                      <div className="flex items-start gap-1">
                        <label
                          htmlFor={cbId}
                          className="flex items-center justify-center size-11 shrink-0 cursor-pointer -ml-2.5 -mt-1"
                        >
                          <input
                            id={cbId}
                            type="checkbox"
                            checked={isOn}
                            onChange={() => toggle(x.id)}
                            className="size-5 accent-[var(--apple-blue)]"
                            aria-label={`${label} 선택`}
                            aria-describedby={x.possibleDuplicate ? dupId : undefined}
                          />
                        </label>
                        <div className="min-w-0 flex-1 space-y-2">
                          <label htmlFor={cbId} className="flex items-start justify-between gap-3 cursor-pointer">
                            <div className="min-w-0">
                              <p className="text-[15px] font-medium text-[var(--apple-label)] truncate">
                                {x.storeName || "가맹점 정보 없음"}
                              </p>
                              <p className="text-footnote text-[var(--apple-secondary-label)] tabular-nums">
                                {formatMonthDay(x.date)}
                                {x.time ? ` ${x.time}` : ""}
                                {x.cardLastFour ? ` · 카드 ${x.cardLastFour}` : ""}
                              </p>
                              {x.possibleDuplicate && (
                                <p
                                  id={dupId}
                                  className="mt-1 flex items-start gap-1 text-[12px] font-medium text-[#C93400] dark:text-[#FF9F0A]"
                                >
                                  <AlertTriangle className="size-3.5 shrink-0 mt-px" aria-hidden />
                                  비슷한 비용이 이미 있습니다 — 중복인지 확인해주세요
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[15px] font-semibold text-[var(--apple-label)] tabular-nums">
                                {formatAmount(x.amount)}원
                              </p>
                              {x.currency !== "KRW" && (
                                <span className="glass-badge glass-badge-blue inline-block mt-0.5">
                                  {x.currency} 해외
                                </span>
                              )}
                            </div>
                          </label>
                          <Input
                            value={titles[x.id] ?? ""}
                            onChange={(e) => handleTitleChange(x.id, e.target.value)}
                            placeholder="제목"
                            maxLength={TITLE_MAX}
                            aria-label={`${label} 제목`}
                            aria-invalid={isOn && !(titles[x.id] ?? "").trim()}
                            className="h-11"
                          />
                          {failure && (
                            <p className="text-[12px] text-[var(--apple-red)]">{failure}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {truncated && (
              <p className="mt-3 p-3 rounded-xl bg-[rgba(255,149,0,0.12)] text-[13px] text-[#C93400] dark:text-[#FF9F0A]">
                결제가 많아 최근 200건만 보입니다. 더 오래된 결제는 종료일을 앞당겨 다시 불러와주세요.
              </p>
            )}

            <p className="mt-4 text-footnote text-[var(--apple-secondary-label)] leading-relaxed">
              영수증 첨부가 필요한 건은 올린 뒤 비용 상세에서 붙일 수 있습니다. 금액은 카드사가 원화로 청구한 금액으로 올라갑니다.
            </p>
          </div>
        </fieldset>
      )}

      {/* 하단 고정 바 — 모바일에선 하단 탭 바 위에 붙는다 */}
      {!allDone && items.length > 0 && (
        <div className="sticky z-30 bottom-[calc(64px+max(8px,env(safe-area-inset-bottom,0px)))] lg:bottom-0">
          <div className="glass p-3 sm:p-4 space-y-2 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
            {submitting ? (
              <p className="text-footnote text-[var(--apple-secondary-label)]">
                올리는 중… (시간이 조금 걸릴 수 있습니다)
              </p>
            ) : (
              blockReason && (
                <p
                  className={cn(
                    "text-footnote",
                    overMax ? "text-[var(--apple-red)]" : "text-[var(--apple-secondary-label)]",
                  )}
                  role={overMax ? "alert" : undefined}
                >
                  {blockReason}
                </p>
              )
            )}
            <div className="flex items-center gap-3">
              <p className="flex-1 min-w-0 text-[14px] font-medium text-[var(--apple-label)] tabular-nums">
                {selectedCount}건 · 합계 {formatAmount(total)}원
              </p>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="rounded-full h-12 px-6 text-[15px] font-semibold bg-[var(--apple-blue)] hover:bg-[color-mix(in_srgb,var(--apple-blue)_85%,black)] shadow-[0_4px_14px_rgba(0,122,255,0.4)] transition-all"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    올리는 중…
                  </>
                ) : (
                  hiddenSelectedCount > 0
                    ? `${selectedCount}건 올리기 · 가려진 ${hiddenSelectedCount}건 포함`
                    : `${selectedCount}건 올리기`
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
