import { groupByMonth, type MonthGroup, type MonthGroupItem } from "./diff";

// ---------------------------------------------------------------------------
// 보드를 프로젝트별 서랍으로 묶는 순수 계산 (DB·React 없음, 단위 테스트 대상)
//
// 프로젝트가 최상위다(오너 피드백 v1.1). 범위 안 프로젝트마다 서랍 하나 — 머리에 이름·법인·참여자 수·
// 기간 소계, 몸통에 그 프로젝트의 달 칸. 하나뿐이어도 서랍으로 보인다(9/22 — 어느 프로젝트인지 머리에 적힌다).
// ---------------------------------------------------------------------------

export interface BoardProjectRef {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  memberCount: number;
}

export interface ProjectGroup<T extends MonthGroupItem> {
  project: BoardProjectRef;
  months: MonthGroup<T>[];
  /** 보이는 달의 PLANNED 합계(취소·마감 제외) */
  total: number;
  /** 보이는 달의 항목 수(상태 무관) */
  count: number;
}

export interface ProjectGroupItem extends MonthGroupItem {
  projectId: string;
  projectName: string;
  companyId: string;
  companyName: string;
  companySlug: string;
}

/**
 * 서랍에 올릴 프로젝트. 프로젝트 칩을 골랐으면 그 하나, 아니면 범위 안 전부.
 * 비어 있으면(고른 프로젝트가 범위 밖 등) 서랍 없이 달 칸만 보인다.
 */
export function drawerProjects<P extends { id: string }>(
  projects: readonly P[],
  projectFilter: string | undefined | null,
): P[] {
  return projectFilter ? projects.filter((p) => p.id === projectFilter) : [...projects];
}

/** 서랍으로 묶을 조건: 서랍에 올릴 프로젝트가 하나라도 있으면. */
export function shouldGroupByProject(drawerProjectCount: number): boolean {
  return drawerProjectCount >= 1;
}

/** 달별 전체 요약 띠는 서랍이 둘 이상일 때만 — 하나면 서랍 머리 소계와 똑같은 숫자를 두 번 보인다. */
export function shouldShowSummaryStrip(groupCount: number): boolean {
  return groupCount >= 2;
}

/**
 * 항목을 프로젝트별로 묶는다. `projects` 순서를 지키고, 항목이 없는 프로젝트도 빈 서랍으로 낸다.
 * 목록에 없는 프로젝트의 항목(범위가 어긋난 드문 경우)은 버리지 않고 카드의 이름으로 뒤에 붙인다.
 */
export function groupByProject<T extends ProjectGroupItem>(
  items: readonly T[],
  projects: readonly BoardProjectRef[],
  keys: readonly string[],
): ProjectGroup<T>[] {
  const buckets = new Map<string, { project: BoardProjectRef; items: T[] }>();
  for (const p of projects) buckets.set(p.id, { project: p, items: [] });
  for (const it of items) {
    let bucket = buckets.get(it.projectId);
    if (!bucket) {
      bucket = {
        project: {
          id: it.projectId,
          name: it.projectName,
          companyId: it.companyId,
          companyName: it.companyName,
          companySlug: it.companySlug,
          memberCount: 0,
        },
        items: [],
      };
      buckets.set(it.projectId, bucket);
    }
    bucket.items.push(it);
  }
  return [...buckets.values()].map(({ project, items: own }) => {
    const months = groupByMonth(own, keys);
    return {
      project,
      months,
      total: months.reduce((sum, m) => sum + m.total, 0),
      count: months.reduce((sum, m) => sum + m.count, 0),
    };
  });
}
