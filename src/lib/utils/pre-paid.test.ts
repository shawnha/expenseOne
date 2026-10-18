/**
 * 부분 선지급 나누기 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isPartialPrePaid,
  percentageForAmount,
  planPrePaidFixedCreate,
  planPrePaidFixedUpdate,
  prePaidShareText,
  prePaidSplit,
} from "./pre-paid";

describe("부분 선지급 나누기 (lib/utils/pre-paid)", () => {
  it("비율로 정한 건 — 예전 계산과 같다(선지급 반올림, 잔금은 차감)", () => {
    const s = prePaidSplit({ amount: 509_081, isPrePaid: true, prePaidPercentage: 50 })!;
    assert.equal(s.prePaidAmount, 254_541); // round(254,540.5)
    assert.equal(s.remainingAmount, 254_540);
    assert.equal(s.prePaidAmount + s.remainingAmount, 509_081);
    assert.equal(s.byAmount, false);
    assert.equal(s.percentage, 50);
    assert.equal(prePaidShareText(s), "50%");
  });

  it("금액으로 정한 건 — 입력한 금액이 그대로, 환산 비율은 계산에 안 쓴다", () => {
    const s = prePaidSplit({
      amount: 12_340_000,
      isPrePaid: true,
      prePaidPercentage: 24, // 3,000,000 / 12,340,000 = 24.3%
      prePaidFixedAmount: 3_000_000,
    })!;
    assert.equal(s.prePaidAmount, 3_000_000);
    assert.equal(s.remainingAmount, 9_340_000);
    assert.equal(s.byAmount, true);
    assert.equal(s.percentage, null);
    assert.equal(prePaidShareText(s), "3,000,000원");
  });

  it("금액이 총액 이상이거나 0 이하면 금액을 버리고 비율로 계산한다", () => {
    for (const fixed of [0, -1, 1_000_000, 2_000_000, 1.5]) {
      const s = prePaidSplit({ amount: 1_000_000, isPrePaid: true, prePaidPercentage: 30, prePaidFixedAmount: fixed })!;
      assert.equal(s.byAmount, false, String(fixed));
      assert.equal(s.prePaidAmount, 300_000);
    }
  });

  it("부분 선지급이 아니면 null — 선지급 아님 / 비율 없음 / 100%", () => {
    assert.equal(prePaidSplit({ amount: 1000, isPrePaid: false, prePaidPercentage: 50 }), null);
    assert.equal(prePaidSplit({ amount: 1000, isPrePaid: true, prePaidPercentage: null }), null);
    assert.equal(prePaidSplit({ amount: 1000, isPrePaid: true, prePaidPercentage: 100, prePaidFixedAmount: 500 }), null);
    assert.equal(isPartialPrePaid({ isPrePaid: true, prePaidPercentage: 99 }), true);
  });

  it("USD 원문(센트)도 같은 방식으로 나눠 합이 맞는다", () => {
    const s = prePaidSplit({ amount: 1_391_234, amountOriginal: 100_001, isPrePaid: true, prePaidPercentage: 30 })!;
    assert.equal(s.prePaidOriginal, 30_000);
    assert.equal(s.remainingOriginal, 70_001);
  });

  it("환산 비율은 1~99 로 묶인다 — 0%·100% 가 되면 잔금이 사라진다", () => {
    assert.equal(percentageForAmount(1_000, 100_000_000), 1);
    assert.equal(percentageForAmount(99_999_000, 100_000_000), 99);
    assert.equal(percentageForAmount(3_000_000, 12_340_000), 24);
    assert.equal(percentageForAmount(500, 1000), 50);
  });

  describe("등록 계획", () => {
    it("금액 없음 → 표에 안 씀", () => {
      assert.deepEqual(planPrePaidFixedCreate({ amount: 1000, currency: "KRW", isPrePaid: true }), { ok: true, write: "none" });
    });
    it("금액 있음 → 표에 쓰고 환산 비율", () => {
      assert.deepEqual(
        planPrePaidFixedCreate({ amount: 12_340_000, currency: "KRW", isPrePaid: true, prePaidFixedAmount: 3_000_000 }),
        { ok: true, write: { amount: 3_000_000 }, prePaidPercentage: 24 },
      );
    });
    it("총액 이상·USD·선지급 아님 → 거절", () => {
      assert.equal(planPrePaidFixedCreate({ amount: 1000, currency: "KRW", isPrePaid: true, prePaidFixedAmount: 1000 }).ok, false);
      assert.equal(planPrePaidFixedCreate({ amount: 1000, currency: "USD", isPrePaid: true, prePaidFixedAmount: 10 }).ok, false);
      assert.equal(planPrePaidFixedCreate({ amount: 1000, currency: "KRW", isPrePaid: false, prePaidFixedAmount: 10 }).ok, false);
    });
  });

  describe("수정 계획", () => {
    const fixedRow = { amount: 10_000_000, currency: "KRW", isPrePaid: true, prePaidPercentage: 30, prePaidFixedAmount: 3_000_000 };
    const pctRow = { ...fixedRow, prePaidFixedAmount: null };

    it("제목만 고침(선지급 키 없음) → 그대로, 환산 비율은 다시 적음", () => {
      assert.deepEqual(planPrePaidFixedUpdate(fixedRow, {}), { ok: true, write: "none", prePaidPercentage: 30 });
      assert.deepEqual(planPrePaidFixedUpdate(pctRow, {}), { ok: true, write: "none" });
    });
    it("총액만 바뀜 → 금액은 그대로, 비율만 새로", () => {
      assert.deepEqual(planPrePaidFixedUpdate(fixedRow, { amount: 12_000_000 }), { ok: true, write: "none", prePaidPercentage: 25 });
    });
    it("총액을 선지급금 이하로 줄이면 거절", () => {
      assert.equal(planPrePaidFixedUpdate(fixedRow, { amount: 3_000_000 }).ok, false);
    });
    it("금액을 바꾸면 표 갱신", () => {
      assert.deepEqual(planPrePaidFixedUpdate(fixedRow, { prePaidFixedAmount: 4_000_000 }), {
        ok: true,
        write: { amount: 4_000_000 },
        prePaidPercentage: 40,
      });
    });
    it("비율로 되돌림(null) · 선지급 끔 · 비율만 다른 값으로(옛 화면) → 표에서 지움", () => {
      assert.deepEqual(planPrePaidFixedUpdate(fixedRow, { prePaidFixedAmount: null, prePaidPercentage: 50 }), { ok: true, write: "delete" });
      assert.deepEqual(planPrePaidFixedUpdate(fixedRow, { isPrePaid: false, prePaidPercentage: null }), { ok: true, write: "delete" });
      assert.deepEqual(planPrePaidFixedUpdate(fixedRow, { prePaidPercentage: 50 }), { ok: true, write: "delete" });
    });
    it("옛 화면이 지금 비율 그대로 보내면 금액 지정 유지", () => {
      assert.deepEqual(planPrePaidFixedUpdate(fixedRow, { prePaidPercentage: 30, isPrePaid: true }), {
        ok: true,
        write: "none",
        prePaidPercentage: 30,
      });
    });
    it("비율 건을 금액으로 바꿈 → 표에 씀", () => {
      assert.deepEqual(planPrePaidFixedUpdate(pctRow, { prePaidFixedAmount: 2_500_000 }), {
        ok: true,
        write: { amount: 2_500_000 },
        prePaidPercentage: 25,
      });
    });
    it("USD 건은 금액 지정 거절", () => {
      assert.equal(planPrePaidFixedUpdate({ ...pctRow, currency: "USD" }, { prePaidFixedAmount: 100 }).ok, false);
    });
  });
});
