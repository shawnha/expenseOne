/**
 * 세금계산서 발행 요청 순수 도우미 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bizNoDigits,
  findHometaxMatch,
  formatBizNo,
  isValidBizNoChecksum,
  issueDeadline,
  issuerName,
  summarizeItems,
} from "./tax-invoice";

describe("사업자등록번호", () => {
  it("숫자만 남기고 3-2-5 로 적는다", () => {
    assert.equal(bizNoDigits("124-81-00998"), "1248100998");
    assert.equal(formatBizNo("1248100998"), "124-81-00998");
    assert.equal(formatBizNo("12345"), "12345");
  });
  it("검증번호 — 실제 번호는 통과, 한 자리 틀리면 실패", () => {
    assert.equal(isValidBizNoChecksum("124-81-00998"), true);
    assert.equal(isValidBizNoChecksum("220-81-62517"), true);
    assert.equal(isValidBizNoChecksum("124-81-00997"), false);
    assert.equal(isValidBizNoChecksum("123"), false);
  });
});

describe("summarizeItems", () => {
  it("두 개까지 적고 나머지는 외 N건", () => {
    assert.equal(summarizeItems(["A", "B"]), "A, B");
    assert.equal(summarizeItems(["A", "B", "C", "D"]), "A, B 외 2건");
    assert.equal(summarizeItems([" ", ""]), "");
  });
});

describe("findHometaxMatch", () => {
  const req = { issuerCode: "HOW", bizNo: "124-81-00998", total: 110_000, supplyDate: "2026-09-20" };
  it("법인·사업자번호·합계가 같고 공급일 7일 전 이후면 맞춘다", () => {
    const hit = findHometaxMatch(req, [
      { issuerCode: "HOW", bizNo: "1248100998", total: 110_000, issueDate: "2026-09-22" },
    ]);
    assert.equal(hit?.issueDate, "2026-09-22");
  });
  it("금액·법인·날짜 중 하나라도 어긋나면 없음", () => {
    assert.equal(
      findHometaxMatch(req, [
        { issuerCode: "HOW", bizNo: "1248100998", total: 100_000, issueDate: "2026-09-22" },
        { issuerCode: "HOK", bizNo: "1248100998", total: 110_000, issueDate: "2026-09-22" },
        { issuerCode: "HOW", bizNo: "1248100998", total: 110_000, issueDate: "2026-09-01" },
      ]),
      null,
    );
  });
});

describe("issueDeadline / issuerName", () => {
  it("다음 달 10일, 12월은 해를 넘긴다", () => {
    assert.equal(issueDeadline("2026-09-23"), "2026-10-10");
    assert.equal(issueDeadline("2026-12-31"), "2027-01-10");
  });
  it("법인 이름", () => {
    assert.equal(issuerName("HOW"), "한아원홀세일");
    assert.equal(issuerName("XXX"), "XXX");
  });
});
