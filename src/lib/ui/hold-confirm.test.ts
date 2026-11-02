/**
 * 길게 눌러 확인 계산 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { distanceOutsideBox, holdProgress, shouldCancelHold } from "./hold-confirm";

const box = { left: 100, top: 100, right: 200, bottom: 140 };

describe("holdProgress", () => {
  it("0 이하는 0, 끝나면 1 로 고정", () => {
    assert.equal(holdProgress(-5, 1000), 0);
    assert.equal(holdProgress(0, 1000), 0);
    assert.equal(holdProgress(500, 1000), 0.5);
    assert.equal(holdProgress(1000, 1000), 1);
    assert.equal(holdProgress(5000, 1000), 1);
  });
  it("duration 이 0 이하면 즉시 완료, NaN 은 0", () => {
    assert.equal(holdProgress(1, 0), 1);
    assert.equal(holdProgress(Number.NaN, 1000), 0);
  });
});

describe("distanceOutsideBox / shouldCancelHold", () => {
  it("안쪽은 0", () => {
    assert.equal(distanceOutsideBox({ x: 150, y: 120 }, box), 0);
    assert.equal(shouldCancelHold({ x: 150, y: 120 }, box), false);
  });
  it("가장자리에서 8px 까지는 유지, 넘으면 취소", () => {
    assert.equal(shouldCancelHold({ x: 208, y: 120 }, box), false);
    assert.equal(shouldCancelHold({ x: 209, y: 120 }, box), true);
    assert.equal(shouldCancelHold({ x: 150, y: 91 }, box), true);
  });
  it("모서리는 대각선 거리", () => {
    assert.equal(distanceOutsideBox({ x: 203, y: 144 }, box), 5);
  });
});
