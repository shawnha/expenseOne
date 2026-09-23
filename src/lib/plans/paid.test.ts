/**
 * "지급 완료" 표시 문구 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { paidMenuLabel, paidStamp, paidText, paidToggleToast, unpaidNote } from "./paid";

describe("지급 완료 표시 문구 (lib/plans/paid)", () => {
  it("표시 = 날짜 · 이름, 이름이 없으면 날짜만, 미표시는 null", () => {
    assert.equal(paidStamp("2026-09-23T01:20:00.000Z", "하승완"), "2026.09.23 · 하승완");
    assert.equal(paidStamp("2026-09-22T15:30:00.000Z", null), "2026.09.23");
    assert.equal(paidStamp(null, "하승완"), null);
  });

  it("읽기 전용 한 줄", () => {
    assert.equal(paidText(null, null), "아직 안 나감");
    assert.equal(paidText("2026-09-23T01:20:00.000Z", "하승완"), "지급 완료 · 2026.09.23 · 하승완");
  });

  it("메뉴는 지금 상태의 반대 동작, 토스트는 바뀐 뒤 상태", () => {
    assert.equal(paidMenuLabel(false), "지급 완료 표시");
    assert.equal(paidMenuLabel(true), "지급 완료 해제");
    assert.equal(paidToggleToast(true), "지급 완료로 표시했습니다.");
    assert.equal(paidToggleToast(false), "지급 완료 표시를 해제했습니다.");
  });

  it("달 머리 둘째 줄은 지급 완료가 있을 때만", () => {
    assert.equal(unpaidNote(1000, 0), null);
    assert.equal(unpaidNote(1234567, 2), "지급 완료 2건 · 미지급 1,234,567원");
  });
});
