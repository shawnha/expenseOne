/**
 * 반복 지급 회차·비용계획 맞추기 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isUntouchedPlan,
  monthEndAfter,
  occurrenceDatesBetween,
  planDateFor,
  planOccurrenceSync,
  planWindow,
  recurringConfigError,
  restartAnchor,
  type DesiredPlanFields,
  type ExistingOccurrence,
} from "./recurring-occurrences";
import type { Schedule } from "./recurring-schedule";

const monthly = (day: number): Schedule => ({ frequency: "MONTHLY", intervalCount: 1, dayOfMonth: day });
const TODAY = "2026-10-18";

const desired: DesiredPlanFields = {
  companyId: "c1",
  projectId: "p1",
  brandId: null,
  title: "고고창고 물류비",
  amount: 1_500_000,
  datePrecision: "DAY",
  vendorName: "유정숙",
};

function occ(date: string, over: Partial<ExistingOccurrence> = {}): ExistingOccurrence {
  return {
    occurrenceId: `o-${date}`,
    occurrenceDate: date,
    runAt: null,
    planId: `plan-${date}`,
    planVersion: 1,
    version: 1,
    status: "PLANNED",
    deletedAt: null,
    paidAt: null,
    erpAppliedAt: null,
    activeLinks: 0,
    plan: { ...desired, plannedDate: date },
    ...over,
  };
}

describe("반복 지급 회차 (lib/recurring-occurrences)", () => {
  it("창 = 오늘 ~ 3달 뒤 말일", () => {
    assert.equal(monthEndAfter(TODAY, 3), "2027-01-31");
    assert.equal(monthEndAfter("2026-11-30", 3), "2027-02-28");
    assert.deepEqual(planWindow({ startsOn: null, endsOn: null }, TODAY), { from: "2026-10-18", to: "2027-01-31" });
  });

  it("시작일·끝나는 날로 창을 줄인다, 끝이 지났으면 null", () => {
    assert.deepEqual(planWindow({ startsOn: "2026-11-05", endsOn: "2026-12-31" }, TODAY), {
      from: "2026-11-05",
      to: "2026-12-31",
    });
    assert.equal(planWindow({ startsOn: "2026-01-01", endsOn: "2026-09-30" }, TODAY), null);
  });

  it("지난 날짜는 깔지 않는다 — 처음 만들 때만 floor 로 시작일까지 내린다", () => {
    assert.equal(planWindow({ startsOn: "2026-08-01", endsOn: null }, TODAY)!.from, "2026-10-18");
    assert.equal(planWindow({ startsOn: "2026-10-03", endsOn: null }, TODAY, "2026-10-03")!.from, "2026-10-03");
  });

  it("창 안의 날짜들", () => {
    assert.deepEqual(occurrenceDatesBetween(monthly(25), "2026-10-25", "2026-10-01", "2027-01-31"), [
      "2026-10-25",
      "2026-11-25",
      "2026-12-25",
      "2027-01-25",
    ]);
    assert.equal(occurrenceDatesBetween({ frequency: "WEEKLY", intervalCount: 1, weekday: 1 }, "2026-01-05", "2026-01-01", "2027-12-31").length, 24);
  });

  it("격월·분기·격주는 기준 회차에서 이어 간다 — 오늘이 바뀌어도 같은 날짜들", () => {
    const bi: Schedule = { frequency: "MONTHLY", intervalCount: 2, dayOfMonth: 25 };
    const want = ["2026-12-25", "2027-02-25"];
    for (const today of ["2026-11-01", "2026-11-10", "2026-12-01"]) {
      assert.deepEqual(occurrenceDatesBetween(bi, "2026-10-25", today, "2027-02-28"), want, today);
    }
    const q: Schedule = { frequency: "MONTHLY", intervalCount: 3, dayOfMonth: 31 };
    assert.deepEqual(occurrenceDatesBetween(q, "2026-11-30", "2026-12-01", "2027-06-30"), ["2027-02-28", "2027-05-31"]);
    const biweekly: Schedule = { frequency: "WEEKLY", intervalCount: 2, weekday: 1 };
    // 기준 11-02(월) → 11-16, 11-30 … 오늘이 11-10 이어도 11-09 가 아니라 11-16
    assert.deepEqual(occurrenceDatesBetween(biweekly, "2026-11-02", "2026-11-10", "2026-12-01"), ["2026-11-16", "2026-11-30"]);
  });

  describe("주기를 바꿨을 때 새 기준 회차", () => {
    const m = (day: number): Schedule => ({ frequency: "MONTHLY", intervalCount: 1, dayOfMonth: day });
    it("입금요청 폼에서 다음 달부터로 만든 반복(11-25) — 10일로 바꾸면 11-10(12-10 으로 건너뛰지 않음)", () => {
      assert.equal(restartAnchor({ schedule: m(10), today: "2026-10-20", previousStartsOn: "2026-11-25", lastRunDate: null }), "2026-11-10");
    });
    it("아직 처리 전(시작 10-25) — 20일로 바꾸면 오늘 10-20", () => {
      assert.equal(restartAnchor({ schedule: m(20), today: "2026-10-20", previousStartsOn: "2026-10-25", lastRunDate: null }), "2026-10-20");
    });
    it("이번 달 10-05 를 이미 처리 — 25일로 바꿔도 이번 달에 또 안 나가고 11-25", () => {
      assert.equal(restartAnchor({ schedule: m(25), today: "2026-10-18", previousStartsOn: "2026-09-05", lastRunDate: "2026-10-05" }), "2026-11-25");
    });
    it("격월은 마지막 처리에서 두 달 뒤부터", () => {
      const bi: Schedule = { frequency: "MONTHLY", intervalCount: 2, dayOfMonth: 25 };
      assert.equal(restartAnchor({ schedule: bi, today: "2026-10-18", previousStartsOn: null, lastRunDate: "2026-10-05" }), "2026-12-25");
    });
  });

  it("월 단위 계획 날짜는 구간 끝날로", () => {
    assert.equal(planDateFor("2026-11-05", "MONTH_EARLY"), "2026-11-10");
    assert.equal(planDateFor("2026-11-05", "MONTH"), "2026-11-30");
    assert.equal(planDateFor("2026-11-05", "DAY"), "2026-11-05");
  });

  describe("사람이 안 건드린 계획", () => {
    it("기본은 안 건드림", () => assert.equal(isUntouchedPlan(occ("2026-11-25"), TODAY), true));
    for (const [why, over] of [
      ["수정됨(version 다름)", { version: 2 }],
      ["지급 완료", { paidAt: "2026-10-18T00:00:00Z" }],
      ["ERP 반영 표시", { erpAppliedAt: "2026-10-18T00:00:00Z" }],
      ["입금요청 연결", { activeLinks: 1 }],
      ["취소", { status: "CANCELLED" }],
      ["삭제", { deletedAt: "2026-10-18T00:00:00Z" }],
      ["이미 처리된 회차", { runAt: "2026-10-18T00:00:00Z" }],
      ["계획 없음", { planId: null }],
    ] as const) {
      it(`${why} → 건드림`, () => assert.equal(isUntouchedPlan(occ("2026-11-25", over), TODAY), false));
    }
    it("지난 날짜 → 건드림(기록)", () => assert.equal(isUntouchedPlan(occ("2026-10-17"), TODAY), false));
  });

  describe("맞추기", () => {
    const dates = ["2026-10-25", "2026-11-25", "2026-12-25", "2027-01-25"];

    it("처음 → 전부 새로", () => {
      assert.deepEqual(planOccurrenceSync({ desired, dates, existing: [], today: TODAY }), {
        create: dates,
        update: [],
        remove: [],
      });
    });

    it("이미 다 있으면 할 일 없음(cron 이 매일 돌아도 그대로)", () => {
      const existing = dates.map((d) => occ(d));
      assert.deepEqual(planOccurrenceSync({ desired, dates, existing, today: TODAY }), { create: [], update: [], remove: [] });
    });

    it("금액을 고치면 안 건드린 계획만 고친다", () => {
      const existing = [occ("2026-10-25"), occ("2026-11-25", { version: 2 }), occ("2026-12-25"), occ("2027-01-25")];
      const r = planOccurrenceSync({ desired: { ...desired, amount: 1_700_000 }, dates, existing, today: TODAY });
      assert.deepEqual(r.update.map((u) => u.occurrenceId), ["o-2026-10-25", "o-2026-12-25", "o-2027-01-25"]);
      assert.deepEqual(r.update[0].changes, { amount: 1_700_000 });
      assert.equal(r.update[0].expectedVersion, 1);
      assert.deepEqual(r.create, []);
      assert.deepEqual(r.remove, []);
    });

    it("날짜를 바꾸면(25일 → 10일) 안 건드린 계획은 지우고 새 날짜로 깐다, 손댄 건 남긴다", () => {
      const existing = [occ("2026-10-25", { paidAt: "x" }), occ("2026-11-25"), occ("2026-12-25")];
      const newDates = ["2026-11-10", "2026-12-10", "2027-01-10"];
      const r = planOccurrenceSync({ desired, dates: newDates, existing, today: TODAY });
      assert.deepEqual(r.remove.map((x) => x.occurrenceId), ["o-2026-11-25", "o-2026-12-25"]);
      assert.deepEqual(r.create, newDates);
    });

    it("비용계획을 끄면(desired null) 안 건드린 것만 지운다", () => {
      const existing = [occ("2026-10-25", { activeLinks: 1 }), occ("2026-11-25")];
      const r = planOccurrenceSync({ desired: null, dates, existing, today: TODAY });
      assert.deepEqual(r.remove.map((x) => x.occurrenceId), ["o-2026-11-25"]);
      assert.deepEqual(r.create, []);
    });

    it("계획 없이 회차만 있던 날 → 계획을 붙인다. 이미 처리된 회차는 안 붙인다", () => {
      const existing = [
        occ("2026-10-25", { planId: null, planVersion: null, version: null, plan: null, runAt: "2026-10-25T00:00:00Z" }),
        occ("2026-11-25", { planId: null, planVersion: null, version: null, plan: null }),
      ];
      const r = planOccurrenceSync({ desired, dates, existing, today: TODAY });
      assert.deepEqual(r.create, ["2026-11-25", "2026-12-25", "2027-01-25"]);
    });

    it("법인이 바뀌면 안 건드린 계획을 지우고 같은 날짜로 다시 깐다", () => {
      const existing = [occ("2026-11-25")];
      const r = planOccurrenceSync({ desired: { ...desired, companyId: "c2", projectId: "p2" }, dates: ["2026-11-25"], existing, today: TODAY });
      assert.deepEqual(r.remove.map((x) => x.occurrenceId), ["o-2026-11-25"]);
      assert.deepEqual(r.create, ["2026-11-25"]);
    });

    it("정밀도를 월말로 바꾸면 날짜·정밀도 둘 다 고친다", () => {
      const r = planOccurrenceSync({ desired: { ...desired, datePrecision: "MONTH" }, dates: ["2026-11-25"], existing: [occ("2026-11-25")], today: TODAY });
      assert.deepEqual(r.update[0].changes, { plannedDate: "2026-11-30", datePrecision: "MONTH" });
    });
  });

  describe("설정 검사", () => {
    const base = {
      requestMode: "REMIND" as const,
      currency: "KRW",
      category: null,
      bankName: null,
      accountHolder: null,
      accountNumber: null,
      planProjectId: null,
      planBrandId: null,
      startsOn: null,
      endsOn: null,
    };
    it("알림 모드는 계좌 없이 된다", () => assert.equal(recurringConfigError(base), null));
    it("자동 제출은 계좌·카테고리 필수", () => {
      assert.match(recurringConfigError({ ...base, requestMode: "AUTO" })!, /카테고리/);
      assert.match(recurringConfigError({ ...base, requestMode: "AUTO", category: "물류" })!, /계좌/);
    });
    it("계획에만 표시는 프로젝트 필수", () => assert.match(recurringConfigError({ ...base, requestMode: "NONE" })!, /프로젝트/));
    it("분류만 있고 프로젝트 없음 → 거절", () => assert.ok(recurringConfigError({ ...base, planBrandId: "b" })));
    it("달러 건은 계획 불가", () => assert.ok(recurringConfigError({ ...base, currency: "USD", planProjectId: "p" })));
    it("끝이 시작보다 앞 → 거절", () => assert.ok(recurringConfigError({ ...base, startsOn: "2026-11-01", endsOn: "2026-10-01" })));
  });
});
