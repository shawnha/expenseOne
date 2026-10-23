/**
 * 법카 여러 건 한 번에 올리기 화면의 순수 헬퍼 (React·DOM 없음).
 */
import type { PendingCardTx } from "./types";

/** 기본 제목: 앞머리 + 가맹점. 앞머리·가맹점이 비면 있는 쪽만 쓴다. */
export function buildDefaultTitle(prefix: string, storeName: string | null | undefined): string {
  return `${prefix.trim()} ${(storeName ?? "").trim()}`.trim();
}

/**
 * 앞머리가 바뀌었을 때 제목을 다시 만든다. 손으로 고친 제목(edited에 있는 id)은 그대로 둔다.
 * 반환값은 id → 제목 전체 맵(편집된 것은 기존 값 유지).
 */
export function reapplyPrefix(
  items: Pick<PendingCardTx, "id" | "storeName">[],
  titles: Record<string, string>,
  edited: ReadonlySet<string>,
  newPrefix: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const it of items) {
    next[it.id] = edited.has(it.id) && it.id in titles
      ? titles[it.id]
      : buildDefaultTitle(newPrefix, it.storeName);
  }
  return next;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** KST 기준 YYYY-MM-DD */
export function kstDateString(now: Date): string {
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}-${pad2(k.getUTCMonth() + 1)}-${pad2(k.getUTCDate())}`;
}

/** 기본 조회 기간: KST 오늘 기준 최근 days일 ~ 오늘 */
export function defaultDateRange(now: Date, days = 14): { from: string; to: string } {
  const to = kstDateString(now);
  const from = kstDateString(new Date(now.getTime() - days * 24 * 60 * 60 * 1000));
  return { from, to };
}

/** 선택된 결제의 금액 합계(원) */
export function sumSelected(
  items: Pick<PendingCardTx, "id" | "amount">[],
  selected: ReadonlySet<string>,
): number {
  let total = 0;
  for (const it of items) if (selected.has(it.id)) total += it.amount;
  return total;
}

/**
 * 기본 회사: 불러온 결제의 mappedCompanyId 중 가장 많은 것(동률이면 먼저 나온 것), 없으면 사용자 회사.
 * activeCompanyIds 를 주면 그 목록에 있는 회사만 후보로 센다(비활성·삭제된 회사는 선택기에 안 보인다).
 */
export function pickDefaultCompany(
  items: Pick<PendingCardTx, "mappedCompanyId">[],
  userCompanyId: string | null,
  activeCompanyIds?: readonly string[],
): string | null {
  const allowed = activeCompanyIds ? new Set(activeCompanyIds) : null;
  const ok = (id: string) => !allowed || allowed.has(id);
  const counts = new Map<string, number>();
  for (const it of items) {
    if (it.mappedCompanyId && ok(it.mappedCompanyId)) {
      counts.set(it.mappedCompanyId, (counts.get(it.mappedCompanyId) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, c] of counts) {
    if (c > bestCount) {
      best = id;
      bestCount = c;
    }
  }
  if (best) return best;
  return userCompanyId && ok(userCompanyId) ? userCompanyId : null;
}

/** 기본 선택: 중복 의심이 아닌 결제 중 앞에서부터 max건 */
export function defaultSelection(
  items: Pick<PendingCardTx, "id" | "possibleDuplicate">[],
  max: number,
): Set<string> {
  const out = new Set<string>();
  for (const it of items) {
    if (out.size >= max) break;
    if (!it.possibleDuplicate) out.add(it.id);
  }
  return out;
}

/** 실패한 행을 앞으로 올린다(나머지 순서는 유지). */
export function failedFirst<T extends { id: string }>(items: T[], failures: Record<string, string>): T[] {
  const failed = items.filter((x) => x.id in failures);
  if (failed.length === 0) return items;
  return [...failed, ...items.filter((x) => !(x.id in failures))];
}

/** YYYY-MM-DD → MM.DD */
export function formatMonthDay(date: string): string {
  return `${date.slice(5, 7)}.${date.slice(8, 10)}`;
}
