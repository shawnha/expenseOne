import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTourSteps, getNewTourSteps, getTourMode, lastStepLabel } from "./tour-steps";

const text = (role: "MEMBER" | "ADMIN", d: boolean) =>
  getTourSteps(role, d, false)
    .map((s) => [s.title, ...s.body].join(" "))
    .join(" ");

describe("getTourSteps", () => {
  it("MEMBER 7단계, ADMIN 8단계", () => {
    assert.equal(getTourSteps("MEMBER", false, false).length, 7);
    assert.equal(getTourSteps("ADMIN", true, false).length, 8);
  });
  it("법카 알림 바로 뒤에 내 카드 등록 장이 있고, 설정 위치를 화면별로 알려 준다", () => {
    for (const role of ["MEMBER", "ADMIN"] as const) {
      for (const d of [true, false]) {
        const ids = getTourSteps(role, d, false).map((s) => s.id);
        assert.equal(ids[ids.indexOf("card") + 1], "cardSetup");
        const setup = getTourSteps(role, d, false).find((s) => s.id === "cardSetup")!;
        assert.equal(setup.art, "cardSetup");
        assert.match(setup.body.join(" "), /「내 법인카드」/);
        assert.match(setup.body.join(" "), /관리자에게/);
      }
    }
    const desk = getTourSteps("MEMBER", true, false).find((s) => s.id === "cardSetup")!.body.join(" ");
    const mob = getTourSteps("MEMBER", false, false).find((s) => s.id === "cardSetup")!.body.join(" ");
    assert.match(desk, /왼쪽 메뉴/);
    assert.match(mob, /아래 「메뉴」/);
  });
  it("반복 지급·정기 결제를 한 줄로, 관리자에게는 고위드 카드 지정을 알려 준다", () => {
    assert.match(text("MEMBER", false), /「반복 지급」/);
    assert.match(text("MEMBER", false), /「정기 결제」/);
    assert.doesNotMatch(text("MEMBER", true), /「고위드 카드」/);
    assert.match(text("ADMIN", true), /「고위드 카드」/);
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
  it("새 안내(v3)는 카드 등록 한 장, 관리자는 관리자 장까지", () => {
    for (const desktop of [true, false]) {
      for (const plans of [true, false]) {
        assert.deepEqual(getNewTourSteps("MEMBER", desktop, plans, "new").map((s) => s.id), ["cardSetup"]);
        assert.deepEqual(getNewTourSteps("ADMIN", desktop, plans, "new").map((s) => s.id), ["cardSetup", "admin"]);
      }
    }
    assert.equal(lastStepLabel("new"), "알겠어요");
    assert.equal(lastStepLabel("newAll"), "알겠어요");
  });
  it("v2 도 못 본 사람(newAll)은 입금요청·계획 장도 함께", () => {
    assert.deepEqual(getNewTourSteps("MEMBER", false, false, "newAll").map((s) => s.id), ["cardSetup", "deposit"]);
    assert.deepEqual(getNewTourSteps("MEMBER", false, true, "newAll").map((s) => s.id), ["cardSetup", "deposit", "plan"]);
    assert.deepEqual(getNewTourSteps("ADMIN", true, true, "newAll").map((s) => s.id), ["cardSetup", "deposit", "plan", "admin"]);
  });
  it("저장소 v1·v2·v3 조합으로 전체·새 안내·생략을 고른다", () => {
    assert.equal(getTourMode(null, null, null), "full");
    assert.equal(getTourMode(null, "done", "done"), "full");
    assert.equal(getTourMode("done", null, null), "newAll");
    assert.equal(getTourMode("done", "done", null), "new");
    assert.equal(getTourMode("done", "done", "done"), null);
  });
});
