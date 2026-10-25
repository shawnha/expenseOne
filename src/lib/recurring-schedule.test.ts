/**
 * 반복 예정일 계산 단위 테스트. 메모(2026-09-02)엔 "테스트로 고정됨"이라 적혀 있었지만 파일이 없었다.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeSchedule, dueDateFor, firstRunOnOrAfter, nextRunAfter, type Schedule } from "./recurring-schedule";

const monthly = (day: number, n = 1): Schedule => ({ frequency: "MONTHLY", intervalCount: n, dayOfMonth: day });

describe("반복 예정일 (lib/recurring-schedule)", () => {
  it("매달 31일 → 2월은 말일, 다음 달은 다시 31일(3/28 이 아님)", () => {
    const s = monthly(31);
    assert.equal(nextRunAfter(s, "2027-01-31"), "2027-02-28");
    assert.equal(nextRunAfter(s, "2027-02-28"), "2027-03-31");
    assert.equal(nextRunAfter(s, "2028-01-31"), "2028-02-29"); // 윤년
    assert.equal(nextRunAfter(s, "2026-04-29"), "2026-04-30");
  });

  it("nextRunAfter 는 항상 기준일보다 뒤 — 같은 날을 주면 중복 생성", () => {
    assert.equal(nextRunAfter(monthly(18), "2026-10-18"), "2026-11-18");
    assert.equal(nextRunAfter(monthly(18), "2026-10-17"), "2026-10-18");
  });

  it("firstRunOnOrAfter 는 오늘 포함", () => {
    assert.equal(firstRunOnOrAfter(monthly(18), "2026-10-18"), "2026-10-18");
    assert.equal(firstRunOnOrAfter(monthly(5), "2026-10-18"), "2026-11-05");
  });

  it("격월·분기는 interval 로", () => {
    assert.equal(nextRunAfter(monthly(10, 2), "2026-10-10"), "2026-12-10");
    assert.equal(nextRunAfter(monthly(10, 3), "2026-11-10"), "2027-02-10");
  });

  it("매주 — 같은 요일이면 다음 주", () => {
    const s: Schedule = { frequency: "WEEKLY", intervalCount: 1, weekday: 0 }; // 일요일
    assert.equal(nextRunAfter(s, "2026-10-18"), "2026-10-25"); // 2026-10-18 은 일요일
    assert.equal(firstRunOnOrAfter(s, "2026-10-18"), "2026-10-18");
  });

  it("매년", () => {
    const s: Schedule = { frequency: "YEARLY", intervalCount: 1, dayOfMonth: 29, monthOfYear: 2 };
    assert.equal(nextRunAfter(s, "2026-10-18"), "2027-02-28");
    assert.equal(nextRunAfter(s, "2027-02-28"), "2028-02-29");
  });

  it("설명·납입기일", () => {
    assert.equal(describeSchedule(monthly(25)), "매달 25일");
    assert.equal(describeSchedule(monthly(25, 2)), "2개월마다 25일");
    assert.equal(dueDateFor("2026-10-30", 5), "2026-11-04");
    assert.equal(dueDateFor("2026-10-30", null), null);
  });
});
