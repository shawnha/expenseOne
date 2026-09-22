/**
 * 카드 월 이동 날짜 계산 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { moveDateToMonth, shiftDateByMonths } from "./move";

describe("moveDateToMonth — DAY 는 날짜 유지, 없는 날은 말일로", () => {
  it("같은 일자로 옮긴다", () => {
    assert.equal(moveDateToMonth("2026-09-15", "DAY", "2026-10"), "2026-10-15");
    assert.equal(moveDateToMonth("2026-09-01", "DAY", "2026-11"), "2026-11-01");
  });
  it("31일 → 30일 달이면 30일, 2월이면 28일", () => {
    assert.equal(moveDateToMonth("2026-01-31", "DAY", "2026-04"), "2026-04-30");
    assert.equal(moveDateToMonth("2026-01-31", "DAY", "2026-02"), "2026-02-28");
    assert.equal(moveDateToMonth("2026-03-30", "DAY", "2026-02"), "2026-02-28");
  });
  it("윤년 2월은 29일", () => {
    assert.equal(moveDateToMonth("2028-01-31", "DAY", "2028-02"), "2028-02-29");
    assert.equal(moveDateToMonth("2027-01-31", "DAY", "2027-02"), "2027-02-28");
  });
  it("해를 넘긴다", () => {
    assert.equal(moveDateToMonth("2026-12-20", "DAY", "2027-01"), "2027-01-20");
    assert.equal(moveDateToMonth("2027-01-05", "DAY", "2026-12"), "2026-12-05");
  });
  it("같은 달이면 그대로", () => {
    assert.equal(moveDateToMonth("2026-09-15", "DAY", "2026-09"), "2026-09-15");
  });
});

describe("moveDateToMonth — MONTH 는 옮긴 달의 말일", () => {
  it("말일로 잡는다(윤년 포함)", () => {
    assert.equal(moveDateToMonth("2026-09-30", "MONTH", "2026-10"), "2026-10-31");
    assert.equal(moveDateToMonth("2026-09-30", "MONTH", "2028-02"), "2028-02-29");
    assert.equal(moveDateToMonth("2026-12-31", "MONTH", "2027-01"), "2027-01-31");
  });
  it("말일이 아닌 값이 들어와도 말일로 정규화한다", () => {
    assert.equal(moveDateToMonth("2026-09-03", "MONTH", "2026-09"), "2026-09-30");
  });
});

describe("moveDateToMonth — 초·중순은 구간을 지킨 채 옮긴다", () => {
  it("초는 옮긴 달 10일, 중순은 20일", () => {
    assert.equal(moveDateToMonth("2026-10-10", "MONTH_EARLY", "2026-11"), "2026-11-10");
    assert.equal(moveDateToMonth("2026-10-20", "MONTH_MID", "2027-02"), "2027-02-20");
    assert.equal(shiftDateByMonths("2026-12-10", "MONTH_EARLY", 1), "2027-01-10");
    assert.equal(shiftDateByMonths("2026-10-20", "MONTH_MID", -1), "2026-09-20");
  });
});

describe("moveDateToMonth — 잘못된 입력", () => {
  it("형식·달력 오류는 null", () => {
    assert.equal(moveDateToMonth("2026-02-30", "DAY", "2026-03"), null);
    assert.equal(moveDateToMonth("2026-09-15", "DAY", "2026-13"), null);
    assert.equal(moveDateToMonth("bad", "DAY", "2026-10"), null);
  });
});

describe("shiftDateByMonths — 이전 달 / 다음 달", () => {
  it("한 달 앞뒤, 연도 경계", () => {
    assert.equal(shiftDateByMonths("2026-12-15", "DAY", 1), "2027-01-15");
    assert.equal(shiftDateByMonths("2026-01-15", "DAY", -1), "2025-12-15");
    assert.equal(shiftDateByMonths("2026-03-31", "DAY", -1), "2026-02-28");
    assert.equal(shiftDateByMonths("2026-10-31", "MONTH", 1), "2026-11-30");
    assert.equal(shiftDateByMonths("2026-11-30", "MONTH", -1), "2026-10-31");
  });
  it("잘못된 날짜는 null", () => {
    assert.equal(shiftDateByMonths("2026-9-1", "DAY", 1), null);
  });
});
