/**
 * "지난번 본 뒤 바뀐 것" 순수 계산 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  changeShortText,
  describeChange,
  dismissFromSummary,
  entryFields,
  summarizeChanges,
  type ChangeEntry,
} from "./changes";

const e = (p: Partial<ChangeEntry>): ChangeEntry => ({
  entityType: "plan",
  action: "UPDATE",
  before: {},
  after: {},
  actorName: "김상민",
  at: "2026-09-27T05:00:00.000Z",
  ...p,
});

describe("summarizeChanges", () => {
  it("이력이 없으면 null", () => {
    assert.equal(summarizeChanges([]), null);
  });

  it("안 본 사이에 만들어졌으면 뒤에 고쳐졌어도 '새로 추가'", () => {
    const m = summarizeChanges([
      e({ action: "CREATE", at: "2026-09-27T01:00:00.000Z" }),
      e({ after: { amount: 5 }, at: "2026-09-27T02:00:00.000Z" }),
    ]);
    assert.equal(m?.kind, "NEW");
    assert.deepEqual(m?.fields, []);
    assert.equal(m?.count, 2);
    assert.equal(changeShortText(m!), "새로 추가");
  });

  it("취소가 섞이면 '취소됨'", () => {
    const m = summarizeChanges([e({ after: { amount: 5 } }), e({ after: { status: "CANCELLED", version: 3 } })]);
    assert.equal(m?.kind, "CANCELLED");
    assert.equal(changeShortText(m!), "취소됨");
  });

  it("수정이면 바뀐 칸을 모으고(날짜 단위는 예정일로), version 은 빼고, 순서대로", () => {
    const m = summarizeChanges([
      e({ after: { plannedDate: "2026-10-31", datePrecision: "MONTH", version: 2 }, at: "2026-09-27T01:00:00.000Z" }),
      e({ after: { amount: 10, version: 3 }, at: "2026-09-27T02:00:00.000Z" }),
      e({ entityType: "link", action: "LINK", at: "2026-09-27T03:00:00.000Z" }),
    ]);
    assert.equal(m?.kind, "UPDATED");
    assert.deepEqual(m?.fields, ["예정일", "금액", "입금요청 연결"]);
    assert.equal(changeShortText(m!), "예정일·금액 외 변경");
  });

  it("여러 사람이 바꿨으면 마지막 사람 외 N명, 시각은 마지막 것", () => {
    const m = summarizeChanges([
      e({ actorName: "이창석", after: { title: "a" }, at: "2026-09-27T01:00:00.000Z" }),
      e({ actorName: "김상민", after: { amount: 1 }, at: "2026-09-27T09:00:00.000Z" }),
    ]);
    assert.equal(m?.actorName, "김상민 외 1명");
    assert.equal(m?.at, "2026-09-27T09:00:00.000Z");
  });

  it("지급·ERP 표시도 변경으로 세고, 카드에는 그 말 그대로", () => {
    assert.deepEqual(entryFields(e({ after: { paid: true } })), ["지급 완료"]);
    assert.deepEqual(entryFields(e({ after: { erpApplied: false } })), ["ERP 해제"]);
    assert.deepEqual(entryFields(e({ entityType: "link", action: "UNLINK" })), ["연결 해제"]);
    assert.equal(changeShortText(summarizeChanges([e({ after: { paid: true } })])!), "지급 완료");
    assert.equal(changeShortText(summarizeChanges([e({ after: { amount: 1 } }), e({ after: { paid: true } })])!), "금액·지급 완료 변경");
  });
});

describe("describeChange", () => {
  const ctx = { names: { b1: "마케팅", b2: "제품 개발" }, currentPrecision: "DAY" };

  it("수정: 금액·예정일(단위 포함)·분류를 이전 → 이후로", () => {
    const d = describeChange(
      e({
        before: { amount: 800000, plannedDate: "2026-10-31", datePrecision: "MONTH", brandId: "b1" },
        after: { amount: 900000, plannedDate: "2026-11-10", datePrecision: "MONTH_EARLY", brandId: "b2", version: 4 },
      }),
      ctx,
    );
    assert.equal(d.title, "계획 수정");
    assert.deepEqual(d.lines, [
      { label: "금액", before: "800,000원", after: "900,000원" },
      { label: "예정일", before: "10월 말", after: "11월 초" },
      { label: "분류", before: "마케팅", after: "제품 개발" },
    ]);
  });

  it("예정일만 옮겼으면(단위 없음) 지금 계획의 단위로 적는다", () => {
    const d = describeChange(e({ before: { plannedDate: "2026-10-05" }, after: { plannedDate: "2026-11-05" } }), ctx);
    assert.deepEqual(d.lines, [{ label: "예정일", before: "2026.10.05", after: "2026.11.05" }]);
  });

  it("추가·취소·지급·연결", () => {
    const created = describeChange(
      e({ action: "CREATE", after: { title: "리뷰노트 잔금", amount: 800000, plannedDate: "2026-10-05", datePrecision: "DAY" } }),
      ctx,
    );
    assert.equal(created.title, "계획 추가");
    assert.equal(created.lines[1].after, "800,000원");
    assert.equal(describeChange(e({ after: { status: "CANCELLED" }, reason: "보류" }), ctx).lines[0].after, "보류");
    assert.equal(describeChange(e({ after: { paid: true } }), ctx).title, "지급 완료 표시");
    assert.equal(
      describeChange(e({ entityType: "link", action: "LINK", after: { snapshotTitle: "리뷰 잔금", snapshotAmount: 400000 } }), ctx)
        .lines[0].after,
      "리뷰 잔금 · 400,000원",
    );
  });

  it("모르는 분류 id 는 (알 수 없음)", () => {
    const d = describeChange(e({ before: { brandId: "zz" }, after: { brandId: null } }), ctx);
    assert.deepEqual(d.lines, [{ label: "분류", before: "(알 수 없음)", after: "(없음)" }]);
  });
});

describe("dismissFromSummary — 하나씩 확인함(보드 띠의 ✓)", () => {
  const mark = (kind: "NEW" | "UPDATED" | "CANCELLED") => ({ kind, fields: [], actorName: null, at: "2026-09-28T00:00:00.000Z", count: 1 });
  const summary = {
    total: 4,
    counts: { NEW: 2, UPDATED: 1, CANCELLED: 1 },
    items: [
      { planId: "a", mark: mark("NEW") },
      { planId: "b", mark: mark("NEW") },
      { planId: "c", mark: mark("UPDATED") },
      { planId: "d", mark: mark("CANCELLED") },
    ],
  };

  it("확인한 줄을 빼고 건수·종류별 수를 함께 줄인다", () => {
    const next = dismissFromSummary(summary, new Set(["b", "c"]));
    assert.deepEqual(next.items.map((i) => i.planId), ["a", "d"]);
    assert.equal(next.total, 2);
    assert.deepEqual(next.counts, { NEW: 1, UPDATED: 0, CANCELLED: 1 });
  });

  it("목록에 없는 id 는 무시한다(건수를 두 번 빼지 않는다)", () => {
    const next = dismissFromSummary(summary, new Set(["zz"]));
    assert.equal(next, summary);
  });

  it("목록이 50건으로 잘려 있어도 total 은 확인한 만큼만 준다", () => {
    const big = { ...summary, total: 70 };
    assert.equal(dismissFromSummary(big, new Set(["a"])).total, 69);
  });

  it("빈 집합이면 그대로", () => {
    assert.equal(dismissFromSummary(summary, new Set()), summary);
  });
});
