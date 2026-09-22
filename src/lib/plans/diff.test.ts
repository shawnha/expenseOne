/**
 * 비용계획 순수 계산(날짜·월 묶기·차이) 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addMonths,
  computeLinkDiff,
  currentMonthKST,
  daysInMonth,
  groupByMonth,
  isMonthPart,
  monthEnd,
  monthPartDate,
  monthPartOfDay,
  monthRange,
  normalizePlannedDate,
  parseIsoDate,
  parseMonth,
  plannedDateLabel,
  toDatePrecision,
} from "./diff";

describe("parseMonth / parseIsoDate", () => {
  it("YYYY-MM 을 읽는다", () => {
    assert.deepEqual(parseMonth("2026-09"), { year: 2026, month: 9 });
    assert.equal(parseMonth("2026-13"), null);
    assert.equal(parseMonth("2026-9"), null);
    assert.equal(parseMonth("abc"), null);
  });
  it("달력에 없는 날은 거부한다", () => {
    assert.deepEqual(parseIsoDate("2026-02-28"), { year: 2026, month: 2, day: 28 });
    assert.equal(parseIsoDate("2026-02-30"), null);
    assert.equal(parseIsoDate("2026-2-3"), null);
    assert.deepEqual(parseIsoDate("2028-02-29"), { year: 2028, month: 2, day: 29 }); // 윤년
  });
});

describe("monthEnd / daysInMonth / addMonths", () => {
  it("말일을 구한다 (윤년 포함)", () => {
    assert.equal(monthEnd(2026, 2), "2026-02-28");
    assert.equal(monthEnd(2028, 2), "2028-02-29");
    assert.equal(monthEnd(2026, 12), "2026-12-31");
    assert.equal(monthEnd(2026, 4), "2026-04-30");
    assert.equal(daysInMonth(2026, 9), 30);
  });
  it("해를 넘겨 더하고 뺀다", () => {
    assert.equal(addMonths("2026-09", 4), "2027-01");
    assert.equal(addMonths("2026-01", -1), "2025-12");
    assert.equal(addMonths("2026-12", 1), "2027-01");
    assert.equal(addMonths("2026-09", 0), "2026-09");
    assert.throws(() => addMonths("2026-9", 1), RangeError);
  });
});

describe("normalizePlannedDate (SCHEMA.md 5절 5 — CHECK cost_plans_month_end)", () => {
  it("MONTH 면 말일로 바꾼다, DAY 면 그대로", () => {
    assert.equal(normalizePlannedDate("2026-09-03", "MONTH"), "2026-09-30");
    assert.equal(normalizePlannedDate("2026-09-30", "MONTH"), "2026-09-30");
    assert.equal(normalizePlannedDate("2026-09-03", "DAY"), "2026-09-03");
    assert.equal(normalizePlannedDate("2026-02-31", "MONTH"), null);
    assert.equal(normalizePlannedDate("2026/09/03", "DAY"), null);
  });

  it("초는 10일, 중순은 20일로 바꾼다(0024)", () => {
    assert.equal(normalizePlannedDate("2026-10-03", "MONTH_EARLY"), "2026-10-10");
    assert.equal(normalizePlannedDate("2026-10-31", "MONTH_EARLY"), "2026-10-10");
    assert.equal(normalizePlannedDate("2026-02-28", "MONTH_MID"), "2026-02-20");
    assert.equal(normalizePlannedDate("2026-02-31", "MONTH_MID"), null);
  });
});

describe("월 구간 도우미", () => {
  it("monthPartOfDay: 1~10 초, 11~20 중순, 21~ 말", () => {
    assert.equal(monthPartOfDay(1), "MONTH_EARLY");
    assert.equal(monthPartOfDay(10), "MONTH_EARLY");
    assert.equal(monthPartOfDay(11), "MONTH_MID");
    assert.equal(monthPartOfDay(20), "MONTH_MID");
    assert.equal(monthPartOfDay(21), "MONTH");
    assert.equal(monthPartOfDay(31), "MONTH");
  });
  it("monthPartDate: 구간 끝날(윤년 말일 포함)", () => {
    assert.equal(monthPartDate(2028, 2, "MONTH"), "2028-02-29");
    assert.equal(monthPartDate(2026, 9, "MONTH_EARLY"), "2026-09-10");
    assert.equal(monthPartDate(2026, 9, "MONTH_MID"), "2026-09-20");
  });
  it("toDatePrecision: 아는 값만 통과, 나머지는 DAY", () => {
    assert.equal(toDatePrecision("MONTH_MID"), "MONTH_MID");
    assert.equal(toDatePrecision("MONTH"), "MONTH");
    assert.equal(toDatePrecision("WEEK"), "DAY");
    assert.equal(toDatePrecision(null), "DAY");
    assert.equal(isMonthPart("DAY"), false);
  });
});

describe("plannedDateLabel (DESIGN.md yyyy.mm.dd)", () => {
  it("DAY 는 yyyy.mm.dd, MONTH 는 N월 말", () => {
    assert.equal(plannedDateLabel("2026-09-03", "DAY"), "2026.09.03");
    assert.equal(plannedDateLabel("2026-09-30", "MONTH"), "9월 말");
    assert.equal(plannedDateLabel("2026-12-31", "MONTH"), "12월 말");
    assert.equal(plannedDateLabel("bad", "DAY"), "bad");
  });
  it("초·중순도 달 이름에 붙인다", () => {
    assert.equal(plannedDateLabel("2026-10-10", "MONTH_EARLY"), "10월 초");
    assert.equal(plannedDateLabel("2026-10-20", "MONTH_MID"), "10월 중순");
  });
});

describe("currentMonthKST", () => {
  it("UTC 자정 직전은 KST 로 다음 날(달)이다", () => {
    // 2026-09-30T15:30Z = 2026-10-01 00:30 KST
    assert.equal(currentMonthKST(new Date("2026-09-30T15:30:00Z")), "2026-10");
    assert.equal(currentMonthKST(new Date("2026-09-30T14:30:00Z")), "2026-09");
    assert.equal(currentMonthKST(new Date("2026-12-31T15:00:00Z")), "2027-01");
  });
});

describe("monthRange", () => {
  it("from 부터 months 달, 종료일은 제외 경계", () => {
    const r = monthRange("2026-11", 4);
    assert.equal(r.fromDate, "2026-11-01");
    assert.equal(r.toDate, "2027-03-01");
    assert.deepEqual(r.keys, ["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
  it("months 는 1~12 로 자른다", () => {
    assert.equal(monthRange("2026-09", 0).keys.length, 1);
    assert.equal(monthRange("2026-09", 99).keys.length, 12);
    assert.equal(monthRange("2026-09", 2.9).keys.length, 2);
    assert.throws(() => monthRange("2026-9", 4), RangeError);
  });
});

describe("groupByMonth", () => {
  const items = [
    { id: "a", plannedDate: "2026-09-05", amount: 100, status: "PLANNED" },
    { id: "b", plannedDate: "2026-09-30", amount: 250, status: "PLANNED" },
    { id: "c", plannedDate: "2026-09-10", amount: 999, status: "CANCELLED" },
    { id: "d", plannedDate: "2026-11-01", amount: 40, status: "PLANNED" },
    { id: "e", plannedDate: "2027-01-01", amount: 1, status: "PLANNED" }, // 범위 밖
  ];
  it("달별로 묶고 PLANNED 만 합산, 빈 달도 낸다", () => {
    const g = groupByMonth(items, ["2026-09", "2026-10", "2026-11", "2026-12"]);
    assert.equal(g.length, 4);
    assert.equal(g[0].month, "2026-09");
    assert.equal(g[0].total, 350);
    assert.equal(g[0].count, 3);
    assert.deepEqual(g[0].items.map((i) => i.id), ["a", "b", "c"]);
    assert.deepEqual(g[1], { month: "2026-10", total: 0, count: 0, items: [] });
    assert.equal(g[2].total, 40);
    assert.equal(g[3].count, 0);
    // 범위 밖(e)은 어디에도 없다
    assert.equal(g.flatMap((x) => x.items).some((i) => i.id === "e"), false);
  });
});

describe("computeLinkDiff (결정 1-2: 스냅샷 고정 + 차이 표시)", () => {
  it("연결 없음 → 차이 = 계획 금액", () => {
    const d = computeLinkDiff(6_000_000, []);
    assert.deepEqual(d, { requestedSum: 0, linkCount: 0, diff: 6_000_000, links: [] });
  });
  it("계획 600만 / 요청 500만 → 차이 100만, 수정된 요청은 표시만", () => {
    const d = computeLinkDiff(6_000_000, [
      { id: "l1", expenseId: "e1", snapshotAmount: 3_000_000, currentAmount: 3_000_000, currentStatus: "APPROVED" },
      { id: "l2", expenseId: "e2", snapshotAmount: 2_000_000, currentAmount: 2_500_000, currentStatus: "SUBMITTED" },
    ]);
    assert.equal(d.requestedSum, 5_000_000);
    assert.equal(d.linkCount, 2);
    assert.equal(d.diff, 1_000_000);
    assert.equal(d.links[0].modifiedAfterLink, false);
    assert.equal(d.links[0].amountDrift, 0);
    assert.equal(d.links[1].modifiedAfterLink, true);
    assert.equal(d.links[1].amountDrift, 500_000);
    assert.equal(d.links[1].deleted, false);
  });
  it("삭제된 요청(expense_id NULL)은 스냅샷을 합계에 남기고 deleted 로 표시", () => {
    const d = computeLinkDiff(1_000_000, [
      { id: "l1", expenseId: null, snapshotAmount: 400_000, currentAmount: null, currentStatus: null },
    ]);
    assert.equal(d.requestedSum, 400_000);
    assert.equal(d.diff, 600_000);
    assert.equal(d.links[0].deleted, true);
    assert.equal(d.links[0].modifiedAfterLink, false);
    assert.equal(d.links[0].amountDrift, null);
  });
  it("초과 요청은 음수 차이", () => {
    const d = computeLinkDiff(100, [
      { id: "l1", expenseId: "e1", snapshotAmount: 150, currentAmount: 150, currentStatus: "APPROVED" },
    ]);
    assert.equal(d.diff, -50);
  });
});
