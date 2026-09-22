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
