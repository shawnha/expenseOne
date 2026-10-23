/**
 * OCR 순수 함수 단위 테스트 (네트워크 호출 없음). 실행: npm run test:unit
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { ocrModelSchema, toOcrFields, toRotation, type OcrModelOutput } from "./prompt";
import { makeOutputImage, rotateJpeg, toJpegForModel, verifyMagic } from "./image";
import { checkRateLimit, resetRateLimit } from "./rate-limit";
import { MAX_PIXELS } from "../image-resize";

const base: OcrModelOutput = {
  doc_type: "카드전표/영수증",
  merchant_name: "가게",
  total_amount: -12000.5,
  supply_amount: -10000,
  vat_amount: 1000,
  amount_includes_vat: "yes",
  currency: "KRW",
  date: "2026-10-01",
  bank_name: null,
  account_holder: null,
  account_number: null,
  card_last4: "1234",
  text_top: "left",
  confidence: "high",
  note: "",
};

async function makeJpeg(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 10, b: 10 } } })
    .jpeg()
    .toBuffer();
}

describe("ocrModelSchema 관용 파싱", () => {
  it("엉뚱한 enum 값은 기본값으로", () => {
    const r = ocrModelSchema.parse({ ...base, doc_type: "인보이스", text_top: "sideways", confidence: "?", amount_includes_vat: "maybe" });
    assert.equal(r.doc_type, "기타");
    assert.equal(r.text_top, "up");
    assert.equal(r.confidence, "low");
    assert.equal(r.amount_includes_vat, "unknown");
  });
});

describe("toOcrFields", () => {
  it("snake → camel, 음수는 절대값", () => {
    const f = toOcrFields(base);
    assert.equal(f.docType, "카드전표/영수증");
    assert.equal(f.merchantName, "가게");
    assert.equal(f.totalAmount, 12000.5);
    assert.equal(f.amountIncludesVat, "yes");
    assert.equal(f.cardLast4, "1234");
    assert.equal(f.supplyAmount, 10000);
    assert.equal(f.vatAmount, 1000);
  });
  it("null 금액 유지, 잘못된 날짜는 null, 카드 4자리 미만은 null", () => {
    const f = toOcrFields({ ...base, total_amount: null, date: "10/01", card_last4: "12" });
    assert.equal(f.totalAmount, null);
    assert.equal(f.date, null);
    assert.equal(f.cardLast4, null);
  });
  it("카드 번호가 길게 오면 끝 4자리만", () => {
    assert.equal(toOcrFields({ ...base, card_last4: "1111-2222-3333-4444" }).cardLast4, "4444");
  });
  it("글자 머리 방향 → 시계 방향 회전 각도", () => {
    assert.equal(toRotation("up"), 0);
    assert.equal(toRotation("right"), 270);
    assert.equal(toRotation("down"), 180);
    assert.equal(toRotation("left"), 90);
  });
});

describe("verifyMagic", () => {
  it("JPEG/PNG/WebP/PDF/HEIC", () => {
    assert.ok(verifyMagic(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"));
    assert.ok(verifyMagic(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"));
    assert.ok(verifyMagic(Buffer.from("RIFF\0\0\0\0WEBPVP8 "), "image/webp"));
    assert.ok(verifyMagic(Buffer.from("%PDF-1.7"), "application/pdf"));
    assert.ok(verifyMagic(Buffer.from("\0\0\0\x18ftypheic"), "image/heic"));
    assert.ok(verifyMagic(Buffer.from("\0\0\0\x18ftypmif1"), "image/heif"));
  });
  it("불일치·짧은 입력·미지원 형식은 거부", () => {
    assert.ok(!verifyMagic(Buffer.from("%PDF-1.7"), "image/jpeg"));
    assert.ok(!verifyMagic(Buffer.from("RIFF\0\0\0\0WAVEfmt "), "image/webp"));
    assert.ok(!verifyMagic(Buffer.from("\0\0\0\x18ftypavif"), "image/heic"));
    // mif1 주 브랜드 + 호환 브랜드에 avif → AVIF 이므로 거부
    assert.ok(!verifyMagic(Buffer.from("\0\0\0\x1cftypmif1\0\0\0\0mif1avif"), "image/heif"));
    assert.ok(!verifyMagic(Buffer.from([0xff]), "image/jpeg"));
    assert.ok(!verifyMagic(Buffer.from("anything"), "text/plain"));
  });
});

describe("이미지 전처리", () => {
  it("rotateJpeg 90도는 가로세로가 바뀐다", async () => {
    const out = await rotateJpeg(await makeJpeg(40, 20), 90);
    const m = await sharp(out).metadata();
    assert.equal(m.width, 20);
    assert.equal(m.height, 40);
  });
  it("toJpegForModel은 긴 변 2000px 이내, 확대 없음", async () => {
    const big = await sharp(await makeJpeg(3000, 1000)).toBuffer();
    const m = await sharp(await toJpegForModel(big, "image/jpeg")).metadata();
    assert.equal(m.width, 2000);
    const small = await sharp(await toJpegForModel(await makeJpeg(40, 20), "image/jpeg")).metadata();
    assert.equal(small.width, 40);
  });
  it("makeOutputImage: 추가 회전 반영", async () => {
    const b64 = await makeOutputImage(await makeJpeg(40, 20), "image/jpeg", 270);
    const m = await sharp(Buffer.from(b64, "base64")).metadata();
    assert.equal(m.format, "jpeg");
    assert.equal(m.width, 20);
    assert.equal(m.height, 40);
  });
  it("makeOutputImage: 900만 화소 상한", async () => {
    const huge = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg({ quality: 30 })
      .toBuffer();
    const b64 = await makeOutputImage(huge, "image/jpeg", 0);
    const m = await sharp(Buffer.from(b64, "base64")).metadata();
    assert.ok((m.width ?? 0) * (m.height ?? 0) <= MAX_PIXELS);
    assert.ok((m.width ?? 0) > 3000);
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimit());
  it("창 안에서 max 초과 시 거부, 사용자별 분리", () => {
    for (let i = 0; i < 3; i++) assert.ok(checkRateLimit("u1", 1000 + i, 3, 10_000));
    assert.ok(!checkRateLimit("u1", 1010, 3, 10_000));
    assert.ok(checkRateLimit("u2", 1010, 3, 10_000));
  });
  it("창이 지나면 다시 허용", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("u1", 1000, 3, 10_000);
    assert.ok(!checkRateLimit("u1", 5000, 3, 10_000));
    assert.ok(checkRateLimit("u1", 11_001, 3, 10_000));
  });
});
