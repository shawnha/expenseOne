import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { containsPattern, escapeLikePattern } from "./search";

describe("escapeLikePattern — %, _, \\ 는 글자 그대로", () => {
  it("와일드카드를 이스케이프한다", () => {
    assert.equal(escapeLikePattern("100%"), "100\\%");
    assert.equal(escapeLikePattern("_"), "\\_");
    assert.equal(escapeLikePattern("a_b%c"), "a\\_b\\%c");
  });

  it("역슬래시 자신도 이스케이프한다(이중 해석 방지)", () => {
    assert.equal(escapeLikePattern("a\\b"), "a\\\\b");
  });

  it("보통 글자는 건드리지 않는다", () => {
    assert.equal(escapeLikePattern("9월 인플루언서"), "9월 인플루언서");
  });
});

describe("containsPattern — 부분 일치 패턴", () => {
  it("앞뒤에 % 를 붙이고 안쪽만 이스케이프한다", () => {
    assert.equal(containsPattern("100%"), "%100\\%%");
    assert.equal(containsPattern(" 촬영비 "), "%촬영비%");
  });

  it("빈 검색어는 null — 검색 조건을 아예 붙이지 않는다", () => {
    assert.equal(containsPattern(""), null);
    assert.equal(containsPattern("   "), null);
  });
});
