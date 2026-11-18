import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HELP_SECTIONS, filterHelpSections, getHelpSections } from "./content";

describe("사용법 내용", () => {
  it("섹션 id 가 겹치지 않고 비어 있는 섹션·답이 없다", () => {
    const ids = HELP_SECTIONS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const s of HELP_SECTIONS) {
      assert.ok(s.items.length > 0, s.id);
      for (const i of s.items) assert.ok(i.a.length > 0 && i.a.every((l) => l.trim().length > 0), i.q);
    }
  });
  it("관리자 섹션은 관리자에게만", () => {
    assert.ok(!getHelpSections("MEMBER").some((s) => s.adminOnly));
    assert.ok(getHelpSections("ADMIN").some((s) => s.id === "admin"));
  });
  it("법카 섹션 첫 질문이 카드 등록(알림이 안 올 때)", () => {
    const card = HELP_SECTIONS.find((s) => s.id === "card")!;
    assert.match(card.items[0].a.join(" "), /「내 법인카드」/);
  });
  it("검색: 띄어쓰기 무시, 답 안의 말도 찾고, 없는 말이면 빈 목록", () => {
    const all = getHelpSections("MEMBER");
    assert.deepEqual(filterHelpSections(all, ""), all);
    const r = filterHelpSections(all, "후 지급");
    assert.ok(r.length > 0 && r.every((s) => s.items.length > 0));
    assert.ok(r.some((s) => s.id === "deposit"));
    // 떨어져 있는 낱말(「카드」…「등록」)도 찾는다 — 찾기 칸 예시 그대로
    const reg = filterHelpSections(all, "카드 등록");
    assert.ok(reg.find((s) => s.id === "card")?.items.some((i) => i.q.includes("알림이 안 와요")));
    assert.ok(filterHelpSections(all, "취소").some((s) => s.id === "status"));
    assert.deepEqual(filterHelpSections(all, "존재하지않는말xyz"), []);
    // 섹션 이름으로 찾으면 그 섹션 전체
    const refund = filterHelpSections(all, "반품");
    assert.equal(refund.find((s) => s.id === "refund")?.items.length, HELP_SECTIONS.find((s) => s.id === "refund")!.items.length);
  });
  it("반복 지급 방식 이름이 등록 화면과 같다", () => {
    const t = HELP_SECTIONS.find((s) => s.id === "recurring")!.items.flatMap((i) => i.a).join(" ");
    assert.match(t, /「금액 확인 후 직접 올리기」/);
    assert.match(t, /「같은 금액으로 자동 제출」/);
  });
  it("직원 검색에 관리자 답이 섞이지 않는다", () => {
    assert.ok(!filterHelpSections(getHelpSections("MEMBER"), "일괄 승인").some((s) => s.adminOnly));
  });
});
