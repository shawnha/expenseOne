import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getOcrSkipReason, ocrSkipAnnouncement, ocrSkipMessage } from "./ocr-skip";
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

describe("ocrSkipAnnouncement", () => {
  it("건너뛴 파일만 이름과 함께, 파일 순서대로", () => {
    const files = [{ id: "a", name: "영수증.jpg" }, { id: "b", name: "통장.png" }, { id: "c", name: "큰사진.heic" }];
    assert.equal(
      ocrSkipAnnouncement(files, { c: "too_large", b: "failed" }),
      `통장.png: ${ocrSkipMessage("failed")} 큰사진.heic: ${ocrSkipMessage("too_large")}`,
    );
  });
  it("없거나 이미 지운 파일은 비운다", () => {
    assert.equal(ocrSkipAnnouncement([{ id: "a", name: "x.jpg" }], { z: "failed" }), "");
    assert.equal(ocrSkipAnnouncement([], {}), "");
  });
});
