import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pendingCardBatchHref, pendingCardLabel } from "./pending-summary";

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

describe("pendingCardBatchHref", () => {
  it("가장 오래된 날짜부터 열도록 from 을 붙인다", () => {
    assert.equal(pendingCardBatchHref("2026-09-03"), "/expenses/new/card-batch?from=2026-09-03");
  });

  it("날짜가 없거나 형식이 다르면 기본 주소", () => {
    for (const d of [null, undefined, "", "20260903", "2026-9-3", "2026-09-03&x=1"]) {
      assert.equal(pendingCardBatchHref(d), "/expenses/new/card-batch");
    }
  });
});
