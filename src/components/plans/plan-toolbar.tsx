"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

// ---------------------------------------------------------------------------
// 달 이동 + 필터. 상태는 전부 URL 에 둔다 — 뒤로 가기가 통하고, 링크를 그대로 건네줄 수 있고,
// 보드 본문은 서버 컴포넌트로 남는다.
// ---------------------------------------------------------------------------

const ALL = "__all__";
/** 브랜드 미지정(공통)만 보기. 서버 쿼리의 brandId=none 과 같은 값. */
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

  const companyId = searchParams.get("companyId") ?? "";
  const projectId = searchParams.get("projectId") ?? "";
  const brandId = searchParams.get("brandId") ?? "";

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
  const projectsInScope = companyId
    ? board.projects.filter((p) => p.companyId === companyId)
    : board.projects;
  const brandsInScope = companyId
    ? board.brands.filter((b) => b.companyId === companyId)
    : board.brands;

  return (
    <div className={cn("glass rounded-2xl p-3 sm:p-4", isPending && "opacity-60 transition-opacity")}>
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
          <Button type="button" variant="ghost" size="sm" onClick={() => setParams({ from: null })}>
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
              // 프로젝트·브랜드는 법인에 매여 있다. 법인을 바꾸면 같이 풀어 준다.
              setParams({ companyId: key || null, projectId: null, brandId: null })
            }
            ariaLabel="법인 필터"
          />
        )}

        <Select
          value={projectId || ALL}
          onValueChange={(v) => setParams({ projectId: !v || v === ALL ? null : String(v) })}
        >
          <SelectTrigger size="sm" aria-label="프로젝트 필터">
            <SelectValue>
              {projectsInScope.find((p) => p.id === projectId)?.name ?? "전체 프로젝트"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체 프로젝트</SelectItem>
            {projectsInScope.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={brandId || ALL}
          onValueChange={(v) => setParams({ brandId: !v || v === ALL ? null : String(v) })}
        >
          <SelectTrigger size="sm" aria-label="브랜드 필터">
            <SelectValue>
              {brandId === BRAND_NONE
                ? "공통"
                : (brandsInScope.find((b) => b.id === brandId)?.name ?? "전체 브랜드")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>전체 브랜드</SelectItem>
            <SelectItem value={BRAND_NONE}>공통</SelectItem>
            {brandsInScope.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
