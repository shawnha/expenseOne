/**
 * 입금요청 → 법카 사용 변경 자격 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertConvertible,
  canShowConvertButton,
  CONVERT_REASONS,
  CONVERT_ERROR_STATUS,
  ConvertError,
  needsCardLastFourWarning,
  type ConvertibleExpense,
  type ConvertViewer,
} from "./expense-convert";

const OWNER_ID = "3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c";
const OTHER_ID = "9b0c5d6e-7f8a-4e8a-9c21-3f2a9c1e7b4d";

const owner: ConvertViewer = { id: OWNER_ID, role: "MEMBER" };
const stranger: ConvertViewer = { id: OTHER_ID, role: "MEMBER" };
const admin: ConvertViewer = { id: OTHER_ID, role: "ADMIN" };

/** 제출 상태의 평범한 입금요청. */
const submitted: ConvertibleExpense = {
  type: "DEPOSIT_REQUEST",
  status: "SUBMITTED",
  submittedById: OWNER_ID,
  isPurchase: false,
  remainingPaymentRequested: false,
  remainingPaymentApproved: false,
};

function expectBlocked(
  check: ReturnType<typeof assertConvertible>,
  code: "FORBIDDEN" | "CONFLICT",
  reason: string,
) {
  assert.deepEqual(check, { ok: false, code, reason });
}

describe("assertConvertible — 허용", () => {
  it("본인이 제출한 SUBMITTED 입금요청은 바꿀 수 있다", () => {
    assert.deepEqual(assertConvertible(submitted, owner, false, false), { ok: true });
  });

  it("ADMIN은 남의 SUBMITTED 입금요청도 바꿀 수 있다", () => {
    assert.deepEqual(assertConvertible(submitted, admin, false, false), { ok: true });
  });
});

describe("assertConvertible — 유형·권한", () => {
  it("법카 사용은 대상이 아니다", () => {
    expectBlocked(
      assertConvertible({ ...submitted, type: "CORPORATE_CARD" }, owner, false, false),
      "CONFLICT",
      CONVERT_REASONS.notDeposit,
    );
  });

  it("반품 건도 대상이 아니다", () => {
    expectBlocked(
      assertConvertible({ ...submitted, type: "REFUND" }, owner, false, false),
      "CONFLICT",
      CONVERT_REASONS.notDeposit,
    );
  });

  it("남의 요청은 MEMBER가 바꿀 수 없다(FORBIDDEN)", () => {
    expectBlocked(
      assertConvertible(submitted, stranger, false, false),
      "FORBIDDEN",
      CONVERT_REASONS.notOwner,
    );
  });

  it("권한이 없으면 상태 이유를 알려주지 않는다", () => {
    expectBlocked(
      assertConvertible({ ...submitted, status: "APPROVED" }, stranger, false, false),
      "FORBIDDEN",
      CONVERT_REASONS.notOwner,
    );
  });
});

describe("assertConvertible — 상태", () => {
  it("APPROVED는 승인 취소 안내와 함께 막는다", () => {
    expectBlocked(
      assertConvertible({ ...submitted, status: "APPROVED" }, owner, false, false),
      "CONFLICT",
      CONVERT_REASONS.approved,
    );
  });

  it("ADMIN이어도 APPROVED는 막는다 — 승인 취소를 거쳐야 한다", () => {
    expectBlocked(
      assertConvertible({ ...submitted, status: "APPROVED" }, admin, false, false),
      "CONFLICT",
      CONVERT_REASONS.approved,
    );
  });

  it("REJECTED는 막는다", () => {
    expectBlocked(
      assertConvertible({ ...submitted, status: "REJECTED" }, owner, false, false),
      "CONFLICT",
      CONVERT_REASONS.rejected,
    );
  });

  it("CANCELLED는 막는다", () => {
    expectBlocked(
      assertConvertible({ ...submitted, status: "CANCELLED" }, owner, false, false),
      "CONFLICT",
      CONVERT_REASONS.cancelled,
    );
  });
});

describe("assertConvertible — 얽힌 흐름", () => {
  it("사입 건은 막는다", () => {
    expectBlocked(
      assertConvertible({ ...submitted, isPurchase: true }, owner, false, false),
      "CONFLICT",
      CONVERT_REASONS.purchase,
    );
  });

  it("후지급 요청 플래그가 켜져 있으면 막는다", () => {
    expectBlocked(
      assertConvertible({ ...submitted, remainingPaymentRequested: true }, owner, false, false),
      "CONFLICT",
      CONVERT_REASONS.remainingPayment,
    );
  });

  it("후지급 승인 플래그가 켜져 있으면 막는다", () => {
    expectBlocked(
      assertConvertible({ ...submitted, remainingPaymentApproved: true }, owner, false, false),
      "CONFLICT",
      CONVERT_REASONS.remainingPayment,
    );
  });

  it("반품이 이 건을 가리키면 막는다", () => {
    expectBlocked(
      assertConvertible(submitted, owner, false, true),
      "CONFLICT",
      CONVERT_REASONS.hasChildren,
    );
  });

  it("비용계획 활성 연결이 있으면 막는다", () => {
    expectBlocked(
      assertConvertible(submitted, owner, true, false),
      "CONFLICT",
      CONVERT_REASONS.planLinked,
    );
  });

  it("사입·연결이 함께면 사입 이유가 먼저다", () => {
    expectBlocked(
      assertConvertible({ ...submitted, isPurchase: true }, owner, true, true),
      "CONFLICT",
      CONVERT_REASONS.purchase,
    );
  });
});

describe("canShowConvertButton — 화면 미러", () => {
  it("SUBMITTED 입금요청이면 보인다", () => {
    assert.equal(canShowConvertButton(submitted), true);
  });

  it("APPROVED·REJECTED·CANCELLED면 숨긴다", () => {
    for (const status of ["APPROVED", "REJECTED", "CANCELLED"]) {
      assert.equal(canShowConvertButton({ ...submitted, status }), false, status);
    }
  });

  it("법카 사용·반품이면 숨긴다", () => {
    assert.equal(canShowConvertButton({ ...submitted, type: "CORPORATE_CARD" }), false);
    assert.equal(canShowConvertButton({ ...submitted, type: "REFUND" }), false);
  });

  it("사입·후지급 플래그면 숨긴다", () => {
    assert.equal(canShowConvertButton({ ...submitted, isPurchase: true }), false);
    assert.equal(canShowConvertButton({ ...submitted, remainingPaymentRequested: true }), false);
    assert.equal(canShowConvertButton({ ...submitted, remainingPaymentApproved: true }), false);
  });
});

describe("needsCardLastFourWarning — 변경 전 경고", () => {
  it("숫자 4자리가 있으면 경고하지 않는다", () => {
    assert.equal(needsCardLastFourWarning("1234"), false);
    assert.equal(needsCardLastFourWarning("0007"), false);
  });

  it("없거나 비었으면 경고한다", () => {
    assert.equal(needsCardLastFourWarning(null), true);
    assert.equal(needsCardLastFourWarning(undefined), true);
    assert.equal(needsCardLastFourWarning(""), true);
  });

  it("4자리 숫자가 아니면 일치할 수 없으므로 경고한다", () => {
    assert.equal(needsCardLastFourWarning("123"), true);
    assert.equal(needsCardLastFourWarning("12345"), true);
    assert.equal(needsCardLastFourWarning("12a4"), true);
    assert.equal(needsCardLastFourWarning(" 1234"), true);
  });
});

describe("ConvertError", () => {
  it("코드별 HTTP 상태가 정해져 있다", () => {
    assert.equal(CONVERT_ERROR_STATUS.FORBIDDEN, 403);
    assert.equal(CONVERT_ERROR_STATUS.CONFLICT, 409);
  });

  it("메시지와 코드를 그대로 담는다", () => {
    const err = new ConvertError("CONFLICT", CONVERT_REASONS.approved);
    assert.ok(err instanceof Error);
    assert.equal(err.name, "ConvertError");
    assert.equal(err.code, "CONFLICT");
    assert.equal(err.message, CONVERT_REASONS.approved);
  });
});
