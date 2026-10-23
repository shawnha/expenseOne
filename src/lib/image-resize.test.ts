/**
 * 사진 축소 순수 함수 단위 테스트.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LONG_EDGE,
  MAX_PIXELS,
  SKIP_BELOW_BYTES,
  computeTargetSize,
  isHeic,
  shouldShrink,
  toJpegName,
} from "./image-resize";

describe("computeTargetSize", () => {
  it("상한 이하이면 그대로 (확대 없음)", () => {
    assert.deepEqual(computeTargetSize(800, 600), { width: 800, height: 600 });
    assert.deepEqual(computeTargetSize(3000, 3000), { width: 3000, height: 3000 });
  });
  it("아이폰 1200만 화소 사진은 900만 화소 안으로, 비율 유지", () => {
    const t = computeTargetSize(4032, 3024);
    assert.ok(t.width * t.height <= MAX_PIXELS);
    assert.ok(t.width >= 3400 && t.width <= 3500);
    assert.ok(Math.abs(t.width / t.height - 4032 / 3024) < 0.01);
  });
  it("세로로 긴 스크린샷은 폭이 크게 줄지 않는다 (아이폰 3배율 → 2배율 수준)", () => {
    const t = computeTargetSize(1170, 12000);
    assert.equal(t.width, 780);
    assert.equal(t.height, 8000);
    assert.ok(t.width * t.height <= MAX_PIXELS);
  });
  it("긴 변은 8000px을 넘지 않는다", () => {
    const t = computeTargetSize(1000, 20000);
    assert.ok(Math.max(t.width, t.height) <= MAX_LONG_EDGE);
    assert.equal(t.width, 400);
  });
  it("잘못된 크기는 그대로", () => {
    assert.deepEqual(computeTargetSize(0, 0), { width: 0, height: 0 });
  });
});

describe("shouldShrink", () => {
  it("1.5MB 이하이고 크기 상한 이하면 건너뜀", () => {
    assert.equal(shouldShrink(SKIP_BELOW_BYTES, 3000, 3000), false);
    assert.equal(shouldShrink(100_000, 1200, 1600), false);
  });
  it("1.5MB 초과면 축소", () => {
    assert.equal(shouldShrink(SKIP_BELOW_BYTES + 1, 1200, 1600), true);
  });
  it("화소 수가 상한을 넘으면 축소", () => {
    assert.equal(shouldShrink(100_000, 4032, 3024), true);
  });
  it("긴 변이 8000px을 넘으면 축소", () => {
    assert.equal(shouldShrink(100_000, 500, 8001), true);
  });
});

describe("isHeic", () => {
  it("HEIC/HEIF만 true", () => {
    assert.equal(isHeic(new File([], "a.HEIC", { type: "image/heic" })), true);
    assert.equal(isHeic(new File([], "a.heif", { type: "image/heif" })), true);
    assert.equal(isHeic(new File([], "a.jpg", { type: "image/jpeg" })), false);
  });
});

describe("toJpegName", () => {
  it("확장자를 .jpg로 바꾸고 기본 이름 유지", () => {
    assert.equal(toJpegName("IMG_0001.HEIC"), "IMG_0001.jpg");
    assert.equal(toJpegName("영수증.final.png"), "영수증.final.jpg");
  });
  it("확장자가 없으면 .jpg를 붙인다", () => {
    assert.equal(toJpegName("receipt"), "receipt.jpg");
  });
});
