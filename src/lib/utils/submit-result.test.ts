/**
 * 비용 생성 응답 판정 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveCreatedExpenseId,
  SESSION_EXPIRED_MESSAGE,
  UNKNOWN_RESULT_MESSAGE,
} from "./submit-result";

const direct = { redirected: false };
const redirected = { redirected: true };

describe("resolveCreatedExpenseId", () => {
  it("정상 응답에서 id를 꺼낸다", () => {
    assert.equal(
      resolveCreatedExpenseId(direct, { data: { id: "exp_1" } }),
      "exp_1",
    );
  });

  it("세션 만료로 /login에 리다이렉트된 200 응답은 제출 실패로 던진다", () => {
    // middleware가 POST를 /login으로 보내면 fetch가 따라가 200 HTML을 받는다.
    // 본문에 id가 있을 리 없지만, 있더라도 리다이렉트만으로 실패로 본다.
    assert.throws(
      () => resolveCreatedExpenseId(redirected, { data: { id: "exp_1" } }),
      { message: SESSION_EXPIRED_MESSAGE },
    );
  });

  it("본문 파싱 실패(null)는 '등록 여부 확인'으로 던진다 — 첨부 실패가 아니다", () => {
    assert.throws(() => resolveCreatedExpenseId(direct, null), {
      message: UNKNOWN_RESULT_MESSAGE,
    });
  });

  it("id가 없거나 빈 문자열이면 던진다", () => {
    for (const body of [
      {},
      { data: {} },
      { data: { id: "" } },
      { data: { id: "   " } },
      { data: { id: 123 } },
      { data: null },
      undefined,
    ]) {
      assert.throws(
        () => resolveCreatedExpenseId(direct, body),
        { message: UNKNOWN_RESULT_MESSAGE },
        `body=${JSON.stringify(body)}`,
      );
    }
  });

  it("던지는 문구는 '다시 제출'이 아니라 '등록 여부 확인'이다 (중복 제출 방지)", () => {
    assert.match(UNKNOWN_RESULT_MESSAGE, /등록 여부를 확인/);
    assert.doesNotMatch(UNKNOWN_RESULT_MESSAGE, /다시 제출/);
    // 첨부 관련 문구를 쓰면 "건은 만들어졌다"고 오해시킨다.
    assert.doesNotMatch(UNKNOWN_RESULT_MESSAGE, /첨부/);
    assert.doesNotMatch(SESSION_EXPIRED_MESSAGE, /첨부/);
  });
});
