import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getOcrSkipReason } from "./ocr-skip";
import { OCR_MAX_UPLOAD_BYTES } from "./ocr-engine/types";

describe("getOcrSkipReason", () => {
  it("4MB를 초과하면 형식에 관계없이 too_large", () => {
    for (const type of ["image/jpeg", "application/pdf", "text/plain"]) {
      const file = { size: OCR_MAX_UPLOAD_BYTES + 1, type };
      assert.equal(getOcrSkipReason(file, false), "too_large");
    }
  });
  it("4MB 이하의 실패·미지원·빈 파일은 failed", () => {
    for (const size of [0, 1, OCR_MAX_UPLOAD_BYTES]) {
      assert.equal(getOcrSkipReason({ size }, false), "failed");
    }
  });
  it("OCR이 꺼져 있으면 크기와 관계없이 안내하지 않는다", () => {
    for (const size of [0, 1, OCR_MAX_UPLOAD_BYTES + 1]) {
      assert.equal(getOcrSkipReason({ size }, true), null);
    }
  });
});
