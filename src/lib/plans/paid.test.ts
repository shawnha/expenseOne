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

import { isFullyPaidOut, shouldAutoMarkPaid, lastPaidMarkWasAuto } from "./paid";

describe("자동 지급 완료 판단 (lib/plans/paid)", () => {
  const paid = { status: "APPROVED", isPrePaid: false, prePaidPercentage: null, remainingPaymentApproved: false };
  const partial = { status: "APPROVED", isPrePaid: true, prePaidPercentage: 30, remainingPaymentApproved: false };

  it("승인된 일반 건은 다 나간 돈, 제출 상태는 아니다", () => {
    assert.equal(isFullyPaidOut(paid), true);
    assert.equal(isFullyPaidOut({ ...paid, status: "SUBMITTED" }), false);
  });

  it("부분 선지급은 후지급까지 승인돼야 다 나간 것", () => {
    assert.equal(isFullyPaidOut(partial), false);
    assert.equal(isFullyPaidOut({ ...partial, remainingPaymentApproved: true }), true);
  });

  it("선지급 100% 는 부분 선지급이 아니다", () => {
    assert.equal(isFullyPaidOut({ ...partial, prePaidPercentage: 100 }), true);
  });

  it("걸린 건이 전부 다 나가야 찍는다. 반려·취소는 세지 않고, 남는 게 없으면 안 찍는다", () => {
    assert.equal(shouldAutoMarkPaid([paid]), true);
    assert.equal(shouldAutoMarkPaid([paid, { ...paid, status: "SUBMITTED" }]), false);
    assert.equal(shouldAutoMarkPaid([paid, { ...paid, status: "REJECTED" }]), true);
    assert.equal(shouldAutoMarkPaid([{ ...paid, status: "CANCELLED" }]), false);
    assert.equal(shouldAutoMarkPaid([]), false);
    assert.equal(shouldAutoMarkPaid([paid, partial]), false);
  });

  it("최근 표시가 자동이었는지", () => {
    assert.equal(lastPaidMarkWasAuto({ paid: true, auto: true }), true);
    assert.equal(lastPaidMarkWasAuto({ paid: true }), false);
    assert.equal(lastPaidMarkWasAuto({ paid: false, auto: true }), false);
    assert.equal(lastPaidMarkWasAuto(null), false);
  });
});
