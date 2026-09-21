"use client";

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompanyPillGroup } from "@/components/companies/company-pill-group";
import type { BoardResult } from "@/services/plan.service";
import { monthLabel, shiftMonth } from "./plan-client";
import { ProjectDialog } from "./project-dialog";

// ---------------------------------------------------------------------------
// 달 이동 + 필터. 상태는 전부 URL 에 둔다 — 뒤로 가기가 통하고, 링크를 그대로 건네줄 수 있고,
// 보드가 서버에서 받은 데이터를 그대로 쓴다.
//
// 프로젝트가 최상위다(v1.1): 프로젝트는 드롭다운이 아니라 **칩 줄**로 늘어놓고, 줄 끝의 '＋ 프로젝트'가
// 프로젝트 다이얼로그를 연다. 분류(plan_brands)는 그 아래 단계라 드롭다운으로 둔다.
// ---------------------------------------------------------------------------

const ALL = "__all__";
/** 분류 미지정(공통)만 보기. 서버 쿼리의 brandId=none 과 같은 값. */
const BRAND_NONE = "none";

interface PlanToolbarProps {
  board: BoardResult;
  /** 지금 달(KST). 서버가 계산해 넘긴다 — 클라이언트 시계는 시간대가 다를 수 있다. */
  currentMonth: string;
}

export function PlanToolbar({ board, currentMonth }: PlanToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);

  const companyId = searchParams.get("companyId") ?? "";
  const projectId = searchParams.get("projectId") ?? "";
  const brandId = searchParams.get("brandId") ?? "";
  const showCancelled = searchParams.get("status") === "ALL";

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  const lastMonth = shiftMonth(board.from, board.monthCount - 1);
  // 보드의 projects 는 서버가 이미 법인 필터로 걸러 준다. 분류는 법인 필터가 없을 때 전 법인 것이 온다.
  const projectsInScope = board.projects;
  // 법인이 섞여 있으면(대표의 '전체', 여러 법인에 참여) 칩에 법인을 병기한다 — 같은 이름의 프로젝트가
  // 두 법인에 있을 수 있다(QA D-09).
  const mixedCompanies = new Set(projectsInScope.map((p) => p.companyId)).size > 1;
  const brandsInScope = companyId
    ? board.brands.filter((b) => b.companyId === companyId)
    : board.brands;

  // 주소로 받은 필터 값이 목록에 없을 수 있다(남이 공유한 링크, 남의 프로젝트, 비활성 분류).
  // 그때 '전체'라고 적으면 필터가 안 걸린 것처럼 보이는데 서버는 여전히 그 값으로 걸러 낸다 —
  // 보드가 통째로 비어 보이고 빠져나갈 길도 없다. 값 자체를 드러내고 해제 칩을 띄운다.
  const projectName = projectsInScope.find((p) => p.id === projectId)?.name;
  const brandName = brandsInScope.find((b) => b.id === brandId)?.name;
  const unknownProject = Boolean(projectId) && projectName === undefined;
  const unknownBrand = Boolean(brandId) && brandId !== BRAND_NONE && brandName === undefined;
  const brandLabel =
    brandId === BRAND_NONE ? "공통" : (brandName ?? (unknownBrand ? "선택한 분류" : "전체 분류"));

  return (
    <div className={cn("glass p-3 sm:p-4", isPending && "opacity-60 transition-opacity")}>
      {/* 달 이동 */}
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="이전 달"
          onClick={() => setParams({ from: shiftMonth(board.from, -1) })}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Button>

        <p
          className="text-subheadline font-semibold tabular-nums text-[var(--apple-label)]"
          aria-live="polite"
        >
          {monthLabel(board.from)} – {monthLabel(lastMonth)}
        </p>

        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          aria-label="다음 달"
          onClick={() => setParams({ from: shiftMonth(board.from, 1) })}
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </Button>
      </div>

      {board.from !== currentMonth && (
        <div className="mt-1 flex justify-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            onClick={() => setParams({ from: null })}
          >
            이번 달로
          </Button>
        </div>
      )}

      {/* 필터 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--apple-separator)] pt-3">
        {/* 법인 필터는 대표만 — 나머지는 자기가 참여한 프로젝트만 보이므로 법인이 곧 프로젝트다 */}
        {board.isExecutive && board.companies.length > 1 && (
          <CompanyPillGroup
            options={[
              { key: "", label: "전체" },
              ...board.companies.map((c) => ({ key: c.id, label: c.name })),
            ]}
            value={companyId}
            onChange={(key) =>
              // 프로젝트·분류는 법인에 매여 있다. 법인을 바꾸면 같이 풀어 준다.
              setParams({ companyId: key || null, projectId: null, brandId: null })
            }
            ariaLabel="법인 필터"
          />
        )}

        {/* 프로젝트 칩 — 넘치면 이 줄 안에서만 가로 스크롤(페이지는 밀리지 않는다) */}
        <div
          className="flex max-w-full min-w-0 items-center gap-1.5 overflow-x-auto py-1 -my-1"
          role="radiogroup"
          aria-label="프로젝트 필터"
        >
          <ProjectChip label="전체" selected={!projectId} onClick={() => setParams({ projectId: null })} />
          {projectsInScope.map((p) => (
            <ProjectChip
              key={p.id}
              label={p.name}
              hint={mixedCompanies ? p.companyName : undefined}
              selected={projectId === p.id}
              onClick={() => setParams({ projectId: p.id })}
            />
          ))}
          {unknownProject && (
            <ProjectChip label="선택한 프로젝트" selected onClick={() => setParams({ projectId: null })} />
          )}
          <button
            type="button"
            onClick={() => setProjectDialogOpen(true)}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-dashed border-[var(--apple-separator)] px-3 text-[0.8rem] font-medium text-[var(--apple-blue)] transition-colors hover:bg-[var(--apple-blue)]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--apple-blue)]"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            프로젝트
          </button>
        </div>

        <Select
          value={brandId || ALL}
          onValueChange={(v) => setParams({ brandId: !v || v === ALL ? null : String(v) })}
        >
          <SelectTrigger
            className="max-w-[46vw] data-[size=default]:h-11 sm:max-w-56"
            // aria-label 은 트리거 안의 내용을 통째로 덮어쓴다. 선택값을 라벨에 함께 넣어야
            // 스크린 리더가 지금 걸린 필터를 읽을 수 있다(company-pill-group.tsx 와 같은 이유).
            aria-label={`분류 필터: ${brandLabel}`}
          >
            <SelectValue>{brandLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체 분류</SelectItem>
            <SelectItem value={BRAND_NONE}>공통</SelectItem>
            {brandsInScope.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 취소한 계획은 기본값(PLANNED)에서 빠진다. 이 토글이 없으면 취소 사유·이력이 남은 상세로
            돌아갈 길이 앱 어디에도 없다(주소를 직접 고치는 수밖에). */}
        <Button
          type="button"
          variant={showCancelled ? "default" : "outline"}
          size="sm"
          className="min-h-11 rounded-full"
          aria-pressed={showCancelled}
          onClick={() => setParams({ status: showCancelled ? null : "ALL" })}
        >
          취소 포함
        </Button>

        {(unknownProject || unknownBrand) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 rounded-full text-[var(--apple-blue)]"
            onClick={() => setParams({ projectId: null, brandId: null })}
          >
            필터 해제
          </Button>
        )}
      </div>

      {projectDialogOpen && <ProjectDialog open onOpenChange={setProjectDialogOpen} />}
    </div>
  );
}

/** 프로젝트 필터 칩. '취소 포함' 토글과 같은 모양(44px 필). hint 는 법인 병기(작고 흐리게). */
function ProjectChip({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={hint ? `${label} (${hint})` : undefined}
      variant={selected ? "default" : "outline"}
      size="sm"
      className="min-h-11 shrink-0 rounded-full max-w-[60vw] sm:max-w-64"
      onClick={onClick}
    >
      <span className="truncate">{label}</span>
      {hint && <span className="shrink-0 text-[11px] font-normal opacity-70">· {hint}</span>}
    </Button>
  );
}
