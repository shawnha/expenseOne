import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPeriodRange, trendStart } from "./dashboard-period";

describe("관리자 대시보드 기간", () => {
  it("오늘은 한국 시간 기준 — UTC 밤에도 날짜가 하루 늦지 않는다", () => {
    const kst0500 = new Date("2026-11-18T20:00:00Z");
    assert.deepEqual(getPeriodRange("this_month", kst0500), { startDate: "2026-11-01", endDate: "2026-11-19" });
    assert.deepEqual(getPeriodRange("2026-11", kst0500), { startDate: "2026-11-01", endDate: "2026-11-19" });
  });
  it("지난 달은 말일까지, 연·월 넘김", () => {
    const now = new Date("2026-01-05T00:00:00Z");
    assert.deepEqual(getPeriodRange("2025-02", now), { startDate: "2025-02-01", endDate: "2025-02-28" });
    assert.deepEqual(getPeriodRange("3_months", now), { startDate: "2025-11-01", endDate: "2026-01-05" });
    assert.deepEqual(getPeriodRange("6_months", now), { startDate: "2025-08-01", endDate: "2026-01-05" });
    assert.deepEqual(getPeriodRange("this_year", now), { startDate: "2026-01-01", endDate: "2026-01-05" });
  });
  it("추이 시작은 6개월(시작 달 포함)", () => {
    assert.equal(trendStart("2026-03-01"), "2025-10-01");
    assert.equal(trendStart("2026-11-01"), "2026-06-01");
  });
});
