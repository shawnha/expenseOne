/**
 * 비용 수정 권한(상세 「수정」 버튼 · 수정 화면 · 첨부) 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canDeleteAttachment, canEditExpense, canUploadAttachment } from "./expense-edit-access";

const owner = { id: "u-owner", role: "MEMBER" as const };
const other = { id: "u-other", role: "MEMBER" as const };
const admin = { id: "u-admin", role: "ADMIN" as const };
const exp = (p: Partial<{ type: string; status: string; submittedById: string }> = {}) => ({
  type: "DEPOSIT_REQUEST",
  status: "SUBMITTED",
  submittedById: owner.id,
  ...p,
});

describe("canEditExpense", () => {
  it("작성자는 제출·승인 상태의 입금요청·법카를 고친다", () => {
    for (const type of ["DEPOSIT_REQUEST", "CORPORATE_CARD"]) {
      for (const status of ["SUBMITTED", "APPROVED"]) {
        assert.equal(canEditExpense(exp({ type, status }), owner), true, `${type}/${status}`);
      }
    }
  });

  it("다른 직원은 못 고친다", () => {
    assert.equal(canEditExpense(exp(), other), false);
  });

  it("관리자는 누가 올린 것이든 고친다(2026-10-04 오너)", () => {
    for (const type of ["DEPOSIT_REQUEST", "CORPORATE_CARD"]) {
      for (const status of ["SUBMITTED", "APPROVED"]) {
        assert.equal(canEditExpense(exp({ type, status }), admin), true, `${type}/${status}`);
      }
    }
  });

  it("반려·취소는 누구도(관리자도) 화면에서 못 고친다 — 끝난 상태", () => {
    for (const status of ["REJECTED", "CANCELLED"]) {
      assert.equal(canEditExpense(exp({ status }), owner), false);
      assert.equal(canEditExpense(exp({ status }), admin), false);
    }
  });

  it("반품은 누구도 못 고친다 — 삭제 후 재등록", () => {
    assert.equal(canEditExpense(exp({ type: "REFUND", status: "APPROVED" }), owner), false);
    assert.equal(canEditExpense(exp({ type: "REFUND", status: "APPROVED" }), admin), false);
  });

  it("로그인 정보가 없으면 거짓", () => {
    assert.equal(canEditExpense(exp(), null), false);
  });
});

describe("첨부 권한", () => {
  it("올리기: 작성자 또는 관리자, 반려·취소 건은 막힘", () => {
    assert.equal(canUploadAttachment(exp(), owner), true);
    assert.equal(canUploadAttachment(exp(), admin), true);
    assert.equal(canUploadAttachment(exp(), other), false);
    assert.equal(canUploadAttachment(exp({ status: "APPROVED" }), admin), true);
    assert.equal(canUploadAttachment(exp({ status: "REJECTED" }), admin), false);
    assert.equal(canUploadAttachment(exp({ status: "CANCELLED" }), owner), false);
  });

  it("지우기: 올린 사람 또는 관리자, 반려 건은 막힘", () => {
    const att = { uploadedById: owner.id };
    assert.equal(canDeleteAttachment(att, exp(), owner), true);
    assert.equal(canDeleteAttachment(att, exp(), admin), true);
    assert.equal(canDeleteAttachment(att, exp(), other), false);
    assert.equal(canDeleteAttachment(att, exp({ status: "REJECTED" }), admin), false);
    // 관리자가 올린 파일을 작성자가 지울 수는 없다(올린 사람 기준 — 예전 규칙 그대로)
    assert.equal(canDeleteAttachment({ uploadedById: admin.id }, exp(), owner), false);
  });
});
