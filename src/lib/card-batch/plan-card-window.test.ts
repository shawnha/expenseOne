import test from "node:test";
import assert from "node:assert/strict";
import { planCardWindow } from "./plan-card-window";
import { kstDateString } from "./ui";

test("계획 앞뒤 30일과 오늘 중 이른 날까지 조회한다", () => {
  assert.deepEqual(planCardWindow("2026-10-15", "2026-10-27"), { from: "2026-09-15", to: "2026-10-27" });
  assert.deepEqual(planCardWindow("2026-01-01", "2026-10-27"), { from: "2025-12-02", to: "2026-01-31" });
});
test("미래 30일 경계와 먼 미래 계획", () => {
  assert.deepEqual(planCardWindow("2026-11-26", "2026-10-27"), { from: "2026-10-27", to: "2026-10-27" });
  assert.deepEqual(planCardWindow("2026-11-27", "2026-10-27"), { from: "2026-08-28", to: "2026-10-27" });
});
test("윤년·연도 경계에서도 역전 없이 최대 62일 이내다", () => {
  assert.deepEqual(planCardWindow("2024-02-29", "2024-04-01"), { from: "2024-01-30", to: "2024-03-30" });
  for (let offset = -400; offset <= 400; offset++) {
    const planned = new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000).toISOString().slice(0, 10);
    const { from, to } = planCardWindow(planned, "2026-01-01");
    assert.ok(from <= to && to <= "2026-01-01");
    assert.ok((Date.parse(to) - Date.parse(from)) / 86_400_000 <= 62);
  }
});
test("오늘은 KST 날짜를 사용한다", () => {
  const today = kstDateString(new Date("2026-10-26T15:00:00Z"));
  assert.equal(today, "2026-10-27");
  assert.equal(planCardWindow("2026-10-27", today).to, today);
});
