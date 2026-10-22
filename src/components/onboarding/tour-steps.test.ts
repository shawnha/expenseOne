import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTourSteps, lastStepLabel } from "./tour-steps";

const text = (role: "MEMBER" | "ADMIN", d: boolean) =>
  getTourSteps(role, d)
    .map((s) => [s.title, ...s.body].join(" "))
    .join(" ");

describe("getTourSteps", () => {
  it("MEMBER 6단계, ADMIN 7단계", () => {
    assert.equal(getTourSteps("MEMBER", false).length, 6);
    assert.equal(getTourSteps("ADMIN", true).length, 7);
  });
  it("관리자 단계는 ADMIN 에만 있고 마지막은 끝 단계", () => {
    assert.ok(!getTourSteps("MEMBER", true).some((s) => s.id === "admin"));
    assert.ok(getTourSteps("ADMIN", true).some((s) => s.id === "admin"));
    for (const role of ["MEMBER", "ADMIN"] as const) {
      const s = getTourSteps(role, false);
      assert.equal(s[s.length - 1].id, "done");
    }
    assert.equal(lastStepLabel(), "시작하기");
  });
  it("데스크톱/모바일 문구 분기", () => {
    assert.match(text("MEMBER", true), /새 비용/);
    assert.doesNotMatch(text("MEMBER", true), /홈 화면에 추가/);
    assert.match(text("MEMBER", false), /아래 가운데/);
    assert.match(text("MEMBER", false), /홈 화면에 추가/);
    assert.match(text("MEMBER", true), /사용 안내 다시 보기/);
    assert.match(text("MEMBER", false), /사용 안내 다시 보기/);
  });
  it("비용계획·세금계산서 단어 없음", () => {
    for (const role of ["MEMBER", "ADMIN"] as const) {
      for (const d of [true, false]) {
        assert.doesNotMatch(text(role, d), /비용계획|세금계산서/);
      }
    }
  });
});
