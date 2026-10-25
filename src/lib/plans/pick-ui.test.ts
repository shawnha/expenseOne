import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dueDateToFill,
  formatPickDate,
  pickAmountLabel,
  planLinkFailed,
  shouldFillCompany,
  shouldFillTitle,
  todayKST,
} from "./pick-ui";

test("formatPickDate: DAY 는 yyyy.mm.dd, 월 단위는 초·중순·말을 붙인다", () => {
  assert.equal(formatPickDate("2026-10-23", "DAY"), "2026.10.23");
  assert.equal(formatPickDate("2026-10-31", "MONTH"), "2026.10 말");
  assert.equal(formatPickDate("2026-10-10", "MONTH_EARLY"), "2026.10 초");
  assert.equal(formatPickDate("2026-10-20", "MONTH_MID"), "2026.10 중순");
  assert.equal(formatPickDate("2026-10", "DAY"), "2026.10");
  assert.equal(formatPickDate("이상한값", "DAY"), "이상한값");
});

test("pickAmountLabel", () => {
  assert.equal(pickAmountLabel(600000), "계획 600,000원");
});

test("shouldFillTitle: 비어 있을 때만", () => {
  assert.equal(shouldFillTitle(""), true);
  assert.equal(shouldFillTitle("  "), true);
  assert.equal(shouldFillTitle(undefined), true);
  assert.equal(shouldFillTitle("광고비"), false);
});

test("shouldFillCompany", () => {
  const base = { touched: false, planCompanyId: "b", currentCompanyId: "a", availableCompanyIds: ["a", "b"] };
  assert.equal(shouldFillCompany(base), true);
  assert.equal(shouldFillCompany({ ...base, touched: true }), false);
  assert.equal(shouldFillCompany({ ...base, planCompanyId: "a" }), false);
  assert.equal(shouldFillCompany({ ...base, planCompanyId: "z" }), false);
});

test("dueDateToFill", () => {
  const base = { datePrecision: "DAY", plannedDate: "2026-10-30", currentDueDate: null, today: "2026-10-23" };
  assert.equal(dueDateToFill(base), "2026-10-30");
  assert.equal(dueDateToFill({ ...base, plannedDate: "2026-10-23" }), "2026-10-23");
  assert.equal(dueDateToFill({ ...base, plannedDate: "2026-10-22" }), null);
  assert.equal(dueDateToFill({ ...base, datePrecision: "MONTH" }), null);
  assert.equal(dueDateToFill({ ...base, datePrecision: "MONTH_EARLY" }), null);
  assert.equal(dueDateToFill({ ...base, currentDueDate: new Date() }), null);
});

test("todayKST: UTC 15시 이후는 다음 날", () => {
  assert.equal(todayKST(new Date("2026-10-22T16:00:00Z")), "2026-10-23");
  assert.equal(todayKST(new Date("2026-10-22T14:00:00Z")), "2026-10-22");
});

test("planLinkFailed", () => {
  assert.equal(planLinkFailed({ data: { planLinked: false } }), true);
  assert.equal(planLinkFailed({ data: { planLinked: true } }), false);
  assert.equal(planLinkFailed({ data: {} }), false);
  assert.equal(planLinkFailed(null), false);
});
