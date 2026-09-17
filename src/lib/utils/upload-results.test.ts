/**
 * 첨부 업로드 결과 판정 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  countUploadFailures,
  isUploadFailure,
  uploadFailureMessage,
  type UploadResponseLike,
} from "./upload-results";

const fulfilled = (res: UploadResponseLike): PromiseSettledResult<UploadResponseLike> => ({
  status: "fulfilled",
  value: res,
});
const rejected = (): PromiseSettledResult<UploadResponseLike> => ({
  status: "rejected",
  reason: new Error("network"),
});

describe("isUploadFailure", () => {
  it("201 Created는 성공", () => {
    assert.equal(isUploadFailure(fulfilled(new Response(null, { status: 201 }))), false);
  });

  it("HTTP 4xx/5xx는 fulfilled여도 실패", () => {
    for (const status of [400, 403, 413, 500, 503]) {
      assert.equal(isUploadFailure(fulfilled(new Response(null, { status }))), true, `status ${status}`);
    }
  });

  it("fetch 거절(네트워크)은 실패", () => {
    assert.equal(isUploadFailure(rejected()), true);
  });

  it("로그인으로 리다이렉트된 200 응답은 실패", () => {
    assert.equal(isUploadFailure(fulfilled({ ok: true, redirected: true })), true);
  });
});

describe("countUploadFailures", () => {
  it("rejected만 세던 예전 방식은 HTTP 오류를 놓친다", () => {
    const results = [
      fulfilled(new Response(null, { status: 201 })),
      fulfilled(new Response(null, { status: 500 })),
      rejected(),
    ];
    const legacy = results.filter((r) => r.status === "rejected").length;
    assert.equal(legacy, 1);
    assert.equal(countUploadFailures(results), 2);
  });

  it("전부 성공이면 0", () => {
    assert.equal(countUploadFailures([fulfilled({ ok: true, redirected: false })]), 0);
    assert.equal(countUploadFailures([]), 0);
  });
});

describe("uploadFailureMessage", () => {
  it("실패 0건이면 null", () => {
    assert.equal(uploadFailureMessage(0, 3), null);
    assert.equal(uploadFailureMessage(0, 0), null);
  });

  it("전부 실패 / 일부 실패 문구", () => {
    assert.equal(uploadFailureMessage(2, 2), "첨부 파일 업로드에 실패했습니다. 상세 화면에서 다시 첨부해주세요.");
    assert.equal(
      uploadFailureMessage(1, 3),
      "첨부 파일 3개 중 1개 업로드에 실패했습니다. 상세 화면에서 다시 첨부해주세요.",
    );
  });

  it("수정할 수 없는 건(반품)은 다시 첨부하라고 하지 않는다", () => {
    const msg = uploadFailureMessage(1, 2, { editable: false });
    assert.equal(
      msg,
      "첨부 파일 2개 중 1개 업로드에 실패했습니다. 이 건은 수정할 수 없어 다시 첨부할 수 없습니다. 상세 화면에서 저장된 첨부를 확인해주세요.",
    );
  });

  it("필수 첨부(입금요청)면 필수라고 알린다", () => {
    assert.equal(
      uploadFailureMessage(1, 1, { required: true }),
      "첨부 파일 업로드에 실패했습니다. 첨부가 필수이니 상세 화면에서 다시 첨부해주세요.",
    );
  });
});
