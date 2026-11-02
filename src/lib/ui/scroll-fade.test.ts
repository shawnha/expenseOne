/**
 * 스크롤 페이드 계산 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scrollFadeEdges, scrollFadeMask } from "./scroll-fade";

describe("scrollFadeEdges", () => {
  it("내용이 들어가면 둘 다 없음", () => {
    assert.deepEqual(scrollFadeEdges(0, 200, 200), { top: false, bottom: false });
    assert.deepEqual(scrollFadeEdges(0, 200.5, 200), { top: false, bottom: false });
  });
  it("맨 위: 아래만", () => {
    assert.deepEqual(scrollFadeEdges(0, 500, 200), { top: false, bottom: true });
    assert.deepEqual(scrollFadeEdges(1, 500, 200), { top: false, bottom: true });
  });
  it("중간: 양쪽", () => {
    assert.deepEqual(scrollFadeEdges(100, 500, 200), { top: true, bottom: true });
  });
  it("맨 아래(소수 오차 포함): 위만", () => {
    assert.deepEqual(scrollFadeEdges(300, 500, 200), { top: true, bottom: false });
    assert.deepEqual(scrollFadeEdges(299.4, 500, 200), { top: true, bottom: false });
  });
});

describe("scrollFadeMask", () => {
  it("가장자리 없으면 undefined", () => {
    assert.equal(scrollFadeMask({ top: false, bottom: false }), undefined);
  });
  it("가장자리별 그라디언트", () => {
    assert.match(scrollFadeMask({ top: true, bottom: false })!, /transparent 0, #000 20px/);
    assert.match(scrollFadeMask({ top: false, bottom: true })!, /calc\(100% - 20px\), transparent 100%/);
  });
});
