/**
 * 자석 드롭 영역 계산 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { magneticOffset } from "./magnetic";

const rect = { left: 0, top: 0, width: 200, height: 100 };

describe("magneticOffset", () => {
  it("중심이면 0", () => {
    assert.deepEqual(magneticOffset({ x: 100, y: 50 }, rect), { x: 0, y: 0 });
  });
  it("중심에서 멀수록 비례해 이동", () => {
    const o = magneticOffset({ x: 125, y: 50 }, rect, 6, 0.1);
    assert.equal(o.x, 2.5);
    assert.equal(o.y, 0);
  });
  it("최대 6px 로 자른다", () => {
    const o = magneticOffset({ x: 5000, y: -5000 }, rect);
    assert.deepEqual(o, { x: 6, y: -6 });
  });
});
