import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPlanPush, pickRecipients, type PlanPushEvent } from "./notify";

const base: PlanPushEvent = {
  kind: "plan_created",
  actorId: "a",
  actorName: "김담당",
  projectName: "신제품 출시",
  planId: "11111111-1111-4111-8111-111111111111",
  planTitle: "초도 생산 선금",
  candidateIds: ["a", "b", "c", "b"],
};

describe("pickRecipients — 본인 제외·중복 제거", () => {
  it("본인은 빠지고 중복은 한 번만", () => {
    assert.deepEqual(pickRecipients(["a", "b", "c", "b"], "a"), ["b", "c"]);
  });
  it("본인 혼자면 아무도 안 받는다", () => {
    assert.deepEqual(pickRecipients(["a"], "a"), []);
  });
});

describe("buildPlanPush — 문구·링크", () => {
  it("계획 이벤트는 상세로, 참여자 추가는 보드로", () => {
    assert.equal(buildPlanPush(base).url, `/plans/${base.planId}`);
    assert.equal(buildPlanPush({ ...base, kind: "member_added", planId: undefined, planTitle: undefined }).url, "/plans");
  });
  it("행위자 이름과 계획 제목이 본문에 들어간다", () => {
    const m = buildPlanPush({ ...base, kind: "plan_updated" });
    assert.match(m.body, /김담당/);
    assert.match(m.body, /초도 생산 선금/);
    assert.match(m.body, /수정/);
  });
  it("긴 제목은 40자에서 자른다", () => {
    const m = buildPlanPush({ ...base, planTitle: "가".repeat(60) });
    assert.ok(m.body.includes("…"));
    assert.ok(m.body.length < 120);
  });
  it("모든 종류가 문구를 만든다", () => {
    const kinds: PlanPushEvent["kind"][] = [
      "plan_created", "plan_updated", "plan_cancelled", "comment_added", "member_added", "link_added", "link_removed", "project_deleted",
    ];
    for (const kind of kinds) {
      const m = buildPlanPush({ ...base, kind });
      assert.ok(m.title.startsWith("[비용계획]"), kind);
      assert.ok(m.body.length > 0, kind);
    }
  });
});
