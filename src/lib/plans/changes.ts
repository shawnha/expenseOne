import { plannedDateLabel, toDatePrecision } from "./diff";

// ---------------------------------------------------------------------------
// "지난번 본 뒤 바뀐 것" — 순수 계산 (DB·React 없음, 단위 테스트 대상: changes.test.ts)
//
// 오너 요청(2026-09-28): 알림만으로는 무엇이 바뀌었는지 알기 어렵다 — 사이드 메뉴에 숫자로,
// 비용계획에서는 추가·변경된 것을 표시해 달라. 원천은 plan_change_log(plan·link 이력)이고,
// 사람마다 본 시각(plan_seen · plan_seen_all, drizzle/0027) 이후 **다른 사람이** 남긴 것만 센다.
// ---------------------------------------------------------------------------

/** plan_seen_all 행이 없는 사람의 기준 시각. 전 직원에게 연 뒤(9/22 시트 가져오기 다음 날)부터 센다. */
export const SEEN_BASELINE = "2026-09-23T00:00:00+09:00";

export type ChangeKind = "NEW" | "UPDATED" | "CANCELLED";

export interface ChangeEntry {
  entityType: string;
  action: string;
  before: unknown;
  after: unknown;
  reason?: string | null;
  actorName: string | null;
  at: string; // ISO
}

export interface ChangeMark {
  kind: ChangeKind;
  /** 바뀐 칸 이름(화면 말). 새로 추가된 계획이면 빈 배열. */
  fields: string[];
  /** 마지막으로 바꾼 사람. 여럿이면 "김상민 외 1명". */
  actorName: string | null;
  /** 마지막 변경 시각(ISO). */
  at: string;
  count: number;
}

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  NEW: "새로 추가",
  UPDATED: "변경됨",
  CANCELLED: "취소됨",
};

const FIELD_LABEL: Record<string, string> = {
  title: "제목",
  amount: "금액",
  plannedDate: "예정일",
  datePrecision: "예정일",
  brandId: "분류",
  projectId: "프로젝트",
  vendorName: "거래처",
  description: "설명",
};

/** 표시 켜고 끄기는 "무엇 변경"이 아니라 그 자체로 읽힌다 — 카드에 "지급 완료", "ERP 해제" 처럼. */
const TOGGLE_LABELS = new Set(["지급 완료", "지급 해제", "ERP 반영", "ERP 해제", "입금요청 연결", "연결 해제", "취소"]);

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function isCancel(e: ChangeEntry): boolean {
  return e.entityType === "plan" && e.action === "UPDATE" && obj(e.after).status === "CANCELLED";
}

/** 이력 한 줄이 건드린 칸 이름들. */
export function entryFields(e: ChangeEntry): string[] {
  if (e.entityType === "link") return [e.action === "UNLINK" ? "연결 해제" : "입금요청 연결"];
  if (e.entityType !== "plan" || e.action !== "UPDATE") return [];
  if (isCancel(e)) return ["취소"];
  const after = obj(e.after);
  if (typeof after.paid === "boolean") return [after.paid ? "지급 완료" : "지급 해제"];
  if (typeof after.erpApplied === "boolean") return [after.erpApplied ? "ERP 반영" : "ERP 해제"];
  const out: string[] = [];
  for (const key of Object.keys(obj(e.after))) {
    const label = FIELD_LABEL[key];
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/** 한 계획의 안 본 이력들 → 카드 표시 하나. 이력이 없으면 null. */
export function summarizeChanges(entries: readonly ChangeEntry[]): ChangeMark | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const created = sorted.some((e) => e.entityType === "plan" && e.action === "CREATE");
  const cancelled = sorted.some(isCancel);
  const kind: ChangeKind = created ? "NEW" : cancelled ? "CANCELLED" : "UPDATED";

  const fields: string[] = [];
  if (kind !== "NEW") {
    for (const e of sorted) for (const f of entryFields(e)) if (!fields.includes(f)) fields.push(f);
  }

  const last = sorted[sorted.length - 1];
  const actors = [...new Set(sorted.map((e) => e.actorName).filter((n): n is string => Boolean(n)))];
  const actorName =
    actors.length === 0 ? null : actors.length === 1 ? actors[0] : `${last.actorName ?? actors[0]} 외 ${actors.length - 1}명`;

  return { kind, fields, actorName, at: last.at, count: sorted.length };
}

/** 카드 한 줄: "금액·예정일 변경" / "지급 완료" / "새로 추가" / "취소됨". */
export function changeShortText(mark: ChangeMark): string {
  if (mark.kind !== "UPDATED") return CHANGE_KIND_LABEL[mark.kind];
  if (mark.fields.length === 0) return CHANGE_KIND_LABEL.UPDATED;
  const shown = mark.fields.slice(0, 2).join("·");
  if (mark.fields.length > 2) return `${shown} 외 변경`;
  return mark.fields.every((f) => TOGGLE_LABELS.has(f)) ? shown : `${shown} 변경`;
}

// --- 상세 화면: 무엇이 → 무엇으로 -----------------------------------------------------------

/**
 * 보드 띠에서 줄 하나를 「확인」했을 때 화면에 남길 요약(2026-10-01 오너: "개별적으로 확인한 것만 할 수 없나").
 * 서버에 본 기록(POST …/seen)을 남긴 뒤 새로 그려질 때까지, 그 줄을 빼고 건수·종류별 수를 함께 줄인다.
 * 목록은 최근 50건으로 잘려 있을 수 있으므로 total 은 **목록에서 실제로 뺀 줄 수만큼만** 줄인다.
 */
export function dismissFromSummary<
  T extends { planId: string; mark: { kind: ChangeKind } },
  S extends { total: number; counts: Record<ChangeKind, number>; items: T[] },
>(summary: S, dismissed: ReadonlySet<string>): S {
  const removed = summary.items.filter((i) => dismissed.has(i.planId));
  if (removed.length === 0) return summary;
  const counts = { ...summary.counts };
  for (const r of removed) counts[r.mark.kind] = Math.max(0, counts[r.mark.kind] - 1);
  return {
    ...summary,
    total: Math.max(0, summary.total - removed.length),
    counts,
    items: summary.items.filter((i) => !dismissed.has(i.planId)),
  };
}

export interface ChangeLine {
  label: string;
  before?: string;
  after?: string;
}

export interface DescribedChange {
  title: string;
  lines: ChangeLine[];
}

export interface DescribeContext {
  /** 분류·프로젝트 id → 이름. 모르면 "(알 수 없음)". */
  names: Record<string, string>;
  /** 이력에 날짜 단위가 없을 때 쓸 지금 계획의 단위. */
  currentPrecision: string;
}

const won = (v: unknown) => (typeof v === "number" ? `${v.toLocaleString("ko-KR")}원` : "-");
const text = (v: unknown, max = 60) => {
  if (v == null || v === "") return "(없음)";
  const s = String(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

function dateText(date: unknown, precision: unknown, fallback: string): string {
  if (typeof date !== "string") return "-";
  return plannedDateLabel(date, toDatePrecision(typeof precision === "string" ? precision : fallback));
}

export function describeChange(e: ChangeEntry, ctx: DescribeContext): DescribedChange {
  const before = obj(e.before);
  const after = obj(e.after);
  const name = (id: unknown) => (typeof id === "string" ? (ctx.names[id] ?? "(알 수 없음)") : "(없음)");

  if (e.entityType === "link") {
    return e.action === "UNLINK"
      ? { title: "입금요청 연결 해제", lines: [{ label: "금액", before: won(before.snapshotAmount) }] }
      : {
          title: "입금요청 연결",
          lines: [{ label: "요청", after: `${text(after.snapshotTitle, 40)} · ${won(after.snapshotAmount)}` }],
        };
  }
  if (e.entityType === "plan" && e.action === "CREATE") {
    return {
      title: "계획 추가",
      lines: [
        { label: "제목", after: text(after.title) },
        { label: "금액", after: won(after.amount) },
        { label: "예정일", after: dateText(after.plannedDate, after.datePrecision, ctx.currentPrecision) },
      ],
    };
  }
  if (isCancel(e)) {
    return { title: "계획 취소", lines: e.reason ? [{ label: "사유", after: text(e.reason) }] : [] };
  }
  if (typeof after.erpApplied === "boolean") {
    return { title: after.erpApplied ? "ERP 반영 표시" : "ERP 반영 해제", lines: [] };
  }
  if (typeof after.paid === "boolean") {
    return { title: after.paid ? "지급 완료 표시" : "지급 완료 해제", lines: [] };
  }

  const lines: ChangeLine[] = [];
  if ("title" in after) lines.push({ label: "제목", before: text(before.title), after: text(after.title) });
  if ("amount" in after) lines.push({ label: "금액", before: won(before.amount), after: won(after.amount) });
  if ("plannedDate" in after || "datePrecision" in after) {
    const bp = before.datePrecision ?? ctx.currentPrecision;
    const ap = after.datePrecision ?? bp;
    lines.push({
      label: "예정일",
      before: dateText(before.plannedDate ?? after.plannedDate, bp, ctx.currentPrecision),
      after: dateText(after.plannedDate ?? before.plannedDate, ap, ctx.currentPrecision),
    });
  }
  if ("brandId" in after) lines.push({ label: "분류", before: name(before.brandId), after: name(after.brandId) });
  if ("projectId" in after) lines.push({ label: "프로젝트", before: name(before.projectId), after: name(after.projectId) });
  if ("vendorName" in after) lines.push({ label: "거래처", before: text(before.vendorName), after: text(after.vendorName) });
  if ("description" in after) lines.push({ label: "설명", after: text(after.description, 80) });
  return { title: "계획 수정", lines };
}
