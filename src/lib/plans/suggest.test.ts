/**
 * 입금요청 자동 연결 제안 점수 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  amountCloseness,
  dateProximity,
  daysBetween,
  rankSuggestions,
  scoreCandidate,
  titleOverlap,
  titleTokens,
} from "./suggest";

const plan = { amount: 3_000_000, plannedDate: "2026-10-15", title: "10월 인플루언서 캠페인" };

describe("daysBetween / dateProximity", () => {
  it("일수를 세고 해를 넘긴다", () => {
    assert.equal(daysBetween("2026-10-15", "2026-10-20"), 5);
    assert.equal(daysBetween("2026-10-15", "2026-10-01"), -14);
    assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
    assert.equal(daysBetween("2026-10-15", "bad"), null);
  });
  it("0일 = 1, 45일 = 0, 밖은 0", () => {
    assert.equal(dateProximity(0), 1);
    assert.equal(dateProximity(45), 0);
    assert.equal(dateProximity(-45), 0);
    assert.equal(dateProximity(46), 0);
    assert.ok(Math.abs(dateProximity(9) - 0.8) < 1e-9);
  });
});

describe("amountCloseness — 0.8~1.25배, 로그 대칭", () => {
  it("같으면 1, 경계에서 0, 밖은 0", () => {
    assert.equal(amountCloseness(1000, 1000), 1);
    assert.ok(amountCloseness(1000, 800) < 1e-9);
    assert.ok(amountCloseness(1000, 1250) < 1e-9);
    assert.equal(amountCloseness(1000, 799), 0);
    assert.equal(amountCloseness(1000, 1251), 0);
    assert.equal(amountCloseness(0, 1000), 0);
  });
  it("위아래가 대칭이다 (0.9배 ≈ 1/0.9배)", () => {
    const down = amountCloseness(1000, 900);
    const up = amountCloseness(900, 1000);
    assert.ok(Math.abs(down - up) < 1e-9);
    assert.ok(down > 0.5);
  });
});

describe("titleTokens / titleOverlap", () => {
  it("소문자·2글자 이상 토큰", () => {
    assert.deepEqual([...titleTokens("10월 인플루언서 캠페인 (B안)")], ["10월", "인플루언서", "캠페인", "b안"]);
    assert.deepEqual([...titleTokens("A b")], []);
  });
  it("자카드 겹침", () => {
    assert.equal(titleOverlap("인플루언서 캠페인", "인플루언서 캠페인"), 1);
    assert.equal(titleOverlap("인플루언서 캠페인", "인플루언서 촬영"), 1 / 3);
    assert.equal(titleOverlap("인플루언서 캠페인", "사무실 임대료"), 0);
    assert.equal(titleOverlap("", "사무실"), 0);
  });
});

describe("scoreCandidate — 자격과 점수", () => {
  it("날짜도 멀고 금액도 다르면 null", () => {
    assert.equal(
      scoreCandidate(plan, { id: "x", amount: 100_000, date: "2027-03-01", title: "10월 인플루언서 캠페인" }),
      null,
    );
  });
  it("날짜만 가까워도 후보, 금액만 맞아도 후보", () => {
    const byDate = scoreCandidate(plan, { id: "d", amount: 100_000, date: "2026-10-20", title: "임대료" });
    assert.ok(byDate);
    assert.deepEqual(byDate.reasons, ["date"]);
    assert.equal(byDate.dateDiffDays, 5);

    const byAmount = scoreCandidate(plan, { id: "a", amount: 3_000_000, date: "2027-03-01", title: "임대료" });
    assert.ok(byAmount);
    assert.deepEqual(byAmount.reasons, ["amount"]);
    assert.equal(byAmount.score, 1);
  });
  it("경계값: 45일·0.8배는 자격 있음(점수 0), 46일·0.79배는 없음", () => {
    assert.ok(scoreCandidate(plan, { id: "e", amount: 1, date: "2026-11-29", title: "" }));
    assert.equal(scoreCandidate(plan, { id: "e", amount: 1, date: "2026-11-30", title: "" }), null);
    assert.ok(scoreCandidate(plan, { id: "f", amount: 2_400_000, date: "2020-01-01", title: "" }));
    assert.equal(scoreCandidate(plan, { id: "f", amount: 2_399_999, date: "2020-01-01", title: "" }), null);
  });
  it("셋 다 맞으면 3점", () => {
    const s = scoreCandidate(plan, { id: "p", amount: 3_000_000, date: "2026-10-15", title: "10월 인플루언서 캠페인" });
    assert.ok(s);
    assert.equal(s.score, 3);
    assert.deepEqual(s.reasons, ["date", "amount", "title"]);
  });
  it("날짜를 읽을 수 없는 후보는 금액으로만", () => {
    const s = scoreCandidate(plan, { id: "n", amount: 3_000_000, date: "", title: "" });
    assert.ok(s);
    assert.equal(s.score, 1);
    assert.ok(Number.isNaN(s.dateDiffDays));
  });
});

describe("rankSuggestions — 점수순, 최대 5", () => {
  it("점수가 높은 순으로 자른다", () => {
    const candidates = [
      { id: "far", amount: 100, date: "2020-01-01", title: "" }, // 탈락
      { id: "date-only", amount: 100, date: "2026-10-16", title: "" },
      { id: "perfect", amount: 3_000_000, date: "2026-10-15", title: "10월 인플루언서 캠페인" },
      { id: "amount-only", amount: 3_100_000, date: "2020-01-01", title: "" },
      { id: "date+title", amount: 100, date: "2026-10-18", title: "인플루언서 캠페인 정산" },
    ];
    const ranked = rankSuggestions(plan, candidates);
    assert.deepEqual(
      ranked.map((r) => r.candidate.id),
      ["perfect", "date+title", "date-only", "amount-only"],
    );
  });
  it("limit 을 지키고 동점은 날짜 가까운 쪽·입력 순", () => {
    const candidates = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`,
      amount: 100,
      date: "2026-10-15",
      title: "",
    }));
    const ranked = rankSuggestions(plan, candidates);
    assert.equal(ranked.length, 5);
    assert.deepEqual(ranked.map((r) => r.candidate.id), ["c0", "c1", "c2", "c3", "c4"]);

    const tie = rankSuggestions(plan, [
      { id: "later", amount: 3_000_000, date: "2026-10-25", title: "" },
      { id: "closer", amount: 3_000_000, date: "2026-10-16", title: "" },
    ]);
    assert.equal(tie[0].candidate.id, "closer");
  });
  it("빈 목록·limit 0", () => {
    assert.deepEqual(rankSuggestions(plan, []), []);
    assert.deepEqual(rankSuggestions(plan, [{ id: "a", amount: 3_000_000, date: "2026-10-15", title: "" }], 0), []);
  });
});
