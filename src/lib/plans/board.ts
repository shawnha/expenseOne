import { addMonths, groupByMonth, type MonthGroup, type MonthGroupItem } from "./diff";

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

// ---------------------------------------------------------------------------
// 모바일 달 탭 — 한 달씩 보기(오너 요청 9/29: "월별로 빠르게 넘어갈 수 있는 방법").
// 모바일은 달 네 칸이 프로젝트마다 세로로 쌓여, 11월을 보려면 9·10월 카드를 전부 지나야 했다.
// 탭으로 한 달만 남기고, ‹ › 는 한 달씩 — 범위 끝에서는 범위를 한 달 민다(주소의 from).
// ---------------------------------------------------------------------------

/** 달 탭의 '전체'(네 달 모두). */
export const ALL_MONTHS = "ALL";

/** 처음 여는 달: 이번 달이 범위 안이면 이번 달, 아니면 범위의 첫 달. */
export function defaultMobileMonth(keys: readonly string[], currentMonth: string | undefined): string {
  return currentMonth && keys.includes(currentMonth) ? currentMonth : (keys[0] ?? ALL_MONTHS);
}

export interface MobileMonthState {
  /** 사용자가 고른 탭(달 키 또는 ALL_MONTHS). 아직 안 골랐으면 null. */
  selected: string | null;
  /** 범위를 미는 중에 고른 달 — 새 범위가 도착해야 보일 수 있다. */
  pending: string | null;
}

/** 지금 보여 줄 탭. 새 범위를 기다리는 동안에는 보던 달을 유지한다(기본값으로 튀지 않게). */
export function resolveMobileMonth(
  keys: readonly string[],
  state: MobileMonthState,
  currentMonth: string | undefined,
): string {
  if (state.pending && keys.includes(state.pending)) return state.pending;
  if (state.selected === ALL_MONTHS) return ALL_MONTHS;
  if (state.selected && keys.includes(state.selected)) return state.selected;
  return defaultMobileMonth(keys, currentMonth);
}

/**
 * ‹ › 한 번. month 는 다음에 보일 탭, from 은 범위를 옮겨야 할 때만 새 시작 달(아니면 null).
 * '전체'를 보는 중이면 툴바의 ‹ › 와 같다 — 범위만 한 달.
 */
export function stepMobileMonth(
  keys: readonly string[],
  shown: string,
  delta: 1 | -1,
): { month: string; from: string | null } {
  const from = keys[0];
  if (shown === ALL_MONTHS || !keys.includes(shown)) {
    return { month: ALL_MONTHS, from: from ? addMonths(from, delta) : null };
  }
  const target = addMonths(shown, delta);
  if (keys.includes(target)) return { month: target, from: null };
  return { month: target, from: addMonths(from, delta) };
}
