import { test } from "node:test";
import assert from "node:assert/strict";
import { subscriptionKeyOf, monthlyEstimate, isStale, subscriptionMarkFailed } from "./card-subscription";

test("가맹점 키: 앞뒤 공백·대소문자를 무시한다", () => {
  assert.equal(subscriptionKeyOf("  Anthropic PBC "), "anthropic pbc");
  assert.equal(subscriptionKeyOf("ANTHROPIC PBC"), subscriptionKeyOf("anthropic pbc"));
});

test("가맹점이 비면 정기 결제로 묶을 수 없다", () => {
  assert.equal(subscriptionKeyOf(""), null);
  assert.equal(subscriptionKeyOf("   "), null);
  assert.equal(subscriptionKeyOf(null), null);
  assert.equal(subscriptionKeyOf(undefined), null);
  assert.equal(subscriptionKeyOf(" 기타 "), null);
});

test("정기 결제 표시 실패는 subscriptionMarked === false 일 때만", () => {
  assert.equal(subscriptionMarkFailed({ data: { id: "x", subscriptionMarked: false } }), true);
  assert.equal(subscriptionMarkFailed({ data: { id: "x", subscriptionMarked: true } }), false);
  assert.equal(subscriptionMarkFailed({ data: { id: "x" } }), false);
  assert.equal(subscriptionMarkFailed(null), false);
});

test("한 달 합계는 켜져 있는 것만, 결제 기록 없는 건 0원으로 센다", () => {
  assert.deepEqual(
    monthlyEstimate([
      { isActive: true, lastAmount: 30000 },
      { isActive: true, lastAmount: null },
      { isActive: false, lastAmount: 99000 },
    ]),
    { count: 2, total: 30000 },
  );
  assert.deepEqual(monthlyEstimate([]), { count: 0, total: 0 });
});

test("마지막 결제가 45일 넘게 지나면 오래된 것으로 본다", () => {
  assert.equal(isStale("2026-10-01", "2026-11-18"), true);
  assert.equal(isStale("2026-10-10", "2026-11-18"), false);
  assert.equal(isStale(null, "2026-11-18"), false);
  assert.equal(isStale("bad", "2026-11-18"), false);
});
