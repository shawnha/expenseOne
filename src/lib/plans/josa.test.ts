/**
 * 조사 붙이기 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasBatchim, withJosa } from "./josa";

describe("hasBatchim", () => {
  it("받침 유무·비한글", () => {
    assert.equal(hasBatchim("계획"), true);
    assert.equal(hasBatchim("메모"), false);
    assert.equal(hasBatchim("거래처 "), false);
    assert.equal(hasBatchim("ODD"), null);
    assert.equal(hasBatchim(""), null);
    assert.equal(hasBatchim("9월"), true);
  });
});

describe("withJosa", () => {
  it("을/를 · 은/는 · 이/가", () => {
    assert.equal(withJosa("메모", "을/를"), "메모를");
    assert.equal(withJosa("계획", "을/를"), "계획을");
    assert.equal(withJosa("거래처", "은/는"), "거래처는");
    assert.equal(withJosa("설명", "은/는"), "설명은");
    assert.equal(withJosa("사유", "이/가"), "사유가");
    assert.equal(withJosa("입금요청", "이/가"), "입금요청이");
  });
  it("으로/로 는 ㄹ 받침이면 로", () => {
    assert.equal(withJosa("서울", "으로/로"), "서울로");
    assert.equal(withJosa("집", "으로/로"), "집으로");
    assert.equal(withJosa("학교", "으로/로"), "학교로");
  });
  it("한글로 끝나지 않으면 병기로 물러선다", () => {
    assert.equal(withJosa("ODD", "을/를"), "ODD을(를)");
    assert.equal(withJosa("2026", "은/는"), "2026은(는)");
  });
});
