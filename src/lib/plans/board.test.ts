/**
 * 보드 프로젝트 서랍 묶기 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  drawerProjects,
  groupByProject,
  shouldGroupByProject,
  shouldShowSummaryStrip,
  ALL_MONTHS,
  defaultMobileMonth,
  resolveMobileMonth,
  stepMobileMonth,
  type BoardProjectRef,
} from "./board";

const projects: BoardProjectRef[] = [
  { id: "p1", name: "리브랜딩", companyId: "c1", companyName: "코리아", companySlug: "korea", memberCount: 3 },
  { id: "p2", name: "신제품", companyId: "c2", companyName: "리테일", companySlug: "retail", memberCount: 1 },
];
const keys = ["2026-09", "2026-10"];
const item = (id: string, projectId: string, plannedDate: string, amount: number, status = "PLANNED") => ({
  id,
  projectId,
  projectName: projectId === "p1" ? "리브랜딩" : projectId === "p2" ? "신제품" : "옛 프로젝트",
  companyId: "c1",
  companyName: "코리아",
  companySlug: "korea",
  plannedDate,
  amount,
  status,
});

describe("drawerProjects / shouldGroupByProject / shouldShowSummaryStrip", () => {
  it("필터가 없으면 범위 안 전부, 있으면 그 하나", () => {
    assert.deepEqual(drawerProjects(projects, undefined).map((p) => p.id), ["p1", "p2"]);
    assert.deepEqual(drawerProjects(projects, "").map((p) => p.id), ["p1", "p2"]);
    assert.deepEqual(drawerProjects(projects, "p2").map((p) => p.id), ["p2"]);
    assert.deepEqual(drawerProjects(projects, "gone"), []);
  });

  it("프로젝트가 하나뿐이어도 서랍으로 묶는다(이름이 머리에 보이게)", () => {
    assert.equal(shouldGroupByProject(1), true);
    assert.equal(shouldGroupByProject(3), true);
    assert.equal(shouldGroupByProject(0), false);
  });

  it("요약 띠는 서랍이 둘 이상일 때만", () => {
    assert.equal(shouldShowSummaryStrip(1), false);
    assert.equal(shouldShowSummaryStrip(2), true);
  });
});

describe("groupByProject", () => {
  it("프로젝트 순서를 지키고, 달별로 묶고, PLANNED 만 소계", () => {
    const groups = groupByProject(
      [
        item("a", "p2", "2026-09-05", 100),
        item("b", "p1", "2026-09-30", 250),
        item("c", "p1", "2026-10-10", 999, "CANCELLED"),
        item("d", "p1", "2026-10-01", 40),
      ],
      projects,
      keys,
    );
    assert.deepEqual(groups.map((g) => g.project.id), ["p1", "p2"]);
    assert.equal(groups[0].total, 290);
    assert.equal(groups[0].count, 3);
    assert.equal(groups[0].months.length, 2);
    assert.deepEqual(groups[0].months[0].items.map((i) => i.id), ["b"]);
    assert.deepEqual(groups[0].months[1].items.map((i) => i.id), ["c", "d"]);
    assert.equal(groups[0].months[1].total, 40);
    assert.equal(groups[1].total, 100);
    assert.equal(groups[1].project.memberCount, 1);
  });

  it("항목이 없는 프로젝트도 빈 서랍으로 낸다", () => {
    const groups = groupByProject([item("a", "p1", "2026-09-05", 100)], projects, keys);
    assert.equal(groups.length, 2);
    assert.equal(groups[1].count, 0);
    assert.equal(groups[1].total, 0);
    assert.deepEqual(groups[1].months.map((m) => m.items.length), [0, 0]);
  });

  it("목록에 없는 프로젝트의 항목은 카드 이름으로 뒤에 붙인다", () => {
    const groups = groupByProject([item("z", "p9", "2026-09-05", 7)], projects, keys);
    assert.equal(groups.length, 3);
    assert.equal(groups[2].project.id, "p9");
    assert.equal(groups[2].project.name, "옛 프로젝트");
    assert.equal(groups[2].project.memberCount, 0);
    assert.equal(groups[2].total, 7);
  });

  it("범위 밖 달의 항목은 소계에도 들어가지 않는다", () => {
    const groups = groupByProject([item("far", "p1", "2027-01-01", 500)], projects, keys);
    assert.equal(groups[0].total, 0);
    assert.equal(groups[0].count, 0);
  });
});

describe("모바일 달 탭 (한 달씩 보기)", () => {
  const range = ["2026-09", "2026-10", "2026-11", "2026-12"];

  it("기본은 이번 달, 이번 달이 범위 밖이면 범위의 첫 달", () => {
    assert.equal(defaultMobileMonth(range, "2026-10"), "2026-10");
    assert.equal(defaultMobileMonth(range, "2026-08"), "2026-09");
    assert.equal(defaultMobileMonth(range, undefined), "2026-09");
  });

  it("고른 달이 범위 안이면 그 달, 전체면 전체, 범위 밖이면 기본값", () => {
    assert.equal(resolveMobileMonth(range, { selected: "2026-11", pending: null }, "2026-09"), "2026-11");
    assert.equal(resolveMobileMonth(range, { selected: ALL_MONTHS, pending: null }, "2026-09"), ALL_MONTHS);
    assert.equal(resolveMobileMonth(range, { selected: "2027-02", pending: null }, "2026-09"), "2026-09");
    assert.equal(resolveMobileMonth(range, { selected: null, pending: null }, "2026-10"), "2026-10");
  });

  it("범위를 옮기는 중(pending)에는 새 달이 들어올 때까지 지금 보던 달을 유지한다", () => {
    // 12월에서 › → 새 범위(10월~1월)가 오기 전: 1월은 아직 없으니 12월 그대로
    assert.equal(resolveMobileMonth(range, { selected: "2026-12", pending: "2027-01" }, "2026-09"), "2026-12");
    // 새 범위가 오면 1월
    const next = ["2026-10", "2026-11", "2026-12", "2027-01"];
    assert.equal(resolveMobileMonth(next, { selected: "2026-12", pending: "2027-01" }, "2026-09"), "2027-01");
  });

  it("› 는 범위 안이면 다음 달만 고르고, 끝이면 범위를 한 달 민다", () => {
    assert.deepEqual(stepMobileMonth(range, "2026-10", 1), { month: "2026-11", from: null });
    assert.deepEqual(stepMobileMonth(range, "2026-12", 1), { month: "2027-01", from: "2026-10" });
    assert.deepEqual(stepMobileMonth(range, "2026-09", -1), { month: "2026-08", from: "2026-08" });
  });

  it("전체를 보는 중에는 ‹ › 가 범위만 한 달 민다", () => {
    assert.deepEqual(stepMobileMonth(range, ALL_MONTHS, 1), { month: ALL_MONTHS, from: "2026-10" });
    assert.deepEqual(stepMobileMonth(range, ALL_MONTHS, -1), { month: ALL_MONTHS, from: "2026-08" });
  });

  it("연도를 넘긴다", () => {
    const winter = ["2026-10", "2026-11", "2026-12", "2027-01"];
    assert.deepEqual(stepMobileMonth(winter, "2027-01", 1), { month: "2027-02", from: "2026-11" });
  });
});
