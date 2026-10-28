import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTourSteps, getNewTourSteps, getTourMode, lastStepLabel } from "./tour-steps";

const text = (role: "MEMBER" | "ADMIN", d: boolean) =>
  getTourSteps(role, d, false)
    .map((s) => [s.title, ...s.body].join(" "))
    .join(" ");

describe("getTourSteps", () => {
  it("MEMBER 6단계, ADMIN 7단계", () => {
    assert.equal(getTourSteps("MEMBER", false, false).length, 6);
    assert.equal(getTourSteps("ADMIN", true, false).length, 7);
  });
  it("관리자 단계는 ADMIN 에만 있고 마지막은 끝 단계", () => {
    assert.ok(!getTourSteps("MEMBER", true, false).some((s) => s.id === "admin"));
    assert.ok(getTourSteps("ADMIN", true, false).some((s) => s.id === "admin"));
    for (const role of ["MEMBER", "ADMIN"] as const) {
      const s = getTourSteps(role, false, false);
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
  it("생성 메뉴의 전체 종류와 증빙부터 안내한다", () => {
    for (const role of ["MEMBER", "ADMIN"] as const) {
      for (const d of [true, false]) {
        assert.match(text(role, d), /법카 여러 건 한 번에, 세금계산서 발행 요청/);
        assert.match(text(role, d), /입금요청은 증빙부터/);
        assert.match(text(role, d), /「…에서 채움」/);
        assert.match(text(role, d), /제출 전 요약/);
      }
    }
  });
  it("계획 권한이 있을 때만 plan 한 단계를 넣고 계획 전용 그림을 쓴다", () => {
    for (const role of ["MEMBER", "ADMIN"] as const) {
      const without = getTourSteps(role, false, false);
      const withPlans = getTourSteps(role, false, true);
      assert.equal(withPlans.length, without.length + 1);
      assert.ok(!without.some((s) => s.id === "plan"));
      const plan = withPlans.find((s) => s.id === "plan")!;
      assert.equal(plan.art, "plan");
      assert.equal(plan.title, "계획에서 바로 올리기");
      assert.match(plan.body.join(" "), /곧 나갈 내 계획/);
      assert.equal(withPlans.at(-1)?.id, "done");
    }
  });
  it("새로 생긴 것은 deposit 한 장, 계획 권한자는 plan까지 두 장", () => {
    for (const role of ["MEMBER", "ADMIN"] as const) {
      for (const desktop of [true, false]) {
        assert.deepEqual(getNewTourSteps(role, desktop, false).map((s) => s.id), ["deposit"]);
        assert.deepEqual(getNewTourSteps(role, desktop, true).map((s) => s.id), ["deposit", "plan"]);
      }
    }
    assert.equal(lastStepLabel("new"), "알겠어요");
  });
  it("저장소 v1·v2 조합으로 전체·새 안내·생략을 고른다", () => {
    assert.equal(getTourMode(null, null), "full");
    assert.equal(getTourMode(null, "done"), "full");
    assert.equal(getTourMode("done", null), "new");
    assert.equal(getTourMode("done", "done"), null);
  });
});
