import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pendingCardLabel } from "./pending-summary";

describe("pendingCardLabel", () => {
  it("결제 건수에 쉼표를 넣는다", () => {
    assert.equal(pendingCardLabel(1), "아직 안 올린 결제 1건");
    assert.equal(pendingCardLabel(1234), "아직 안 올린 결제 1,234건");
    assert.equal(pendingCardLabel(1234567), "아직 안 올린 결제 1,234,567건");
  });

  it("0건이거나 아직 모르면 숨긴다", () => {
    assert.equal(pendingCardLabel(0), null);
    assert.equal(pendingCardLabel(null), null);
    assert.equal(pendingCardLabel(undefined), null);
  });

  it("유효한 건수가 아니면 숨긴다", () => {
    for (const count of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(pendingCardLabel(count), null);
    }
  });
});
