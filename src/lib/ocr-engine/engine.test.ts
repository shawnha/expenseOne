/**
 * OCR 순수 함수 단위 테스트 (네트워크 호출 없음). 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { ocrModelSchema, toOcrFields, toRotation, type OcrModelOutput } from "./prompt";
import { makeOutputImage, planImageTiles, tileImageForModel, rotateJpeg, toJpegForModel, verifyMagic } from "./image";
import { createRateLimiter } from "./rate-limit";
import { MAX_PIXELS } from "./image";
import { createOcrRouteHandler } from "./handler";
import { createOcrEngine, type OcrEngine } from "./extract";

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

describe("createRateLimiter", () => {
  it("창 안에서 max 초과 시 거부, 키별 분리", () => {
    const rl = createRateLimiter({ max: 3, windowMs: 10_000 });
    for (let i = 0; i < 3; i++) assert.ok(rl.check("u1", 1000 + i));
    assert.ok(!rl.check("u1", 1010));
    assert.ok(rl.check("u2", 1010));
  });
  it("창이 지나면 다시 허용", () => {
    const rl = createRateLimiter({ max: 3, windowMs: 10_000 });
    for (let i = 0; i < 3; i++) rl.check("u1", 1000);
    assert.ok(!rl.check("u1", 5000));
    assert.ok(rl.check("u1", 11_001));
  });
});

// ---- 핸들러 (네트워크 없음, 가짜 엔진) ----
const fakeEngine: OcrEngine = {
  async run() {
    throw new Error("엔진은 호출되면 안 된다");
  },
};
const okAuth = async () => ({ key: "u1" });

function post(opts: { length?: string | null; file?: { type: string; bytes: number[] | string } } = {}): Request {
  const form = new FormData();
  if (opts.file) {
    const data = typeof opts.file.bytes === "string" ? opts.file.bytes : new Uint8Array(opts.file.bytes);
    form.append("file", new File([data], "a", { type: opts.file.type }));
  }
  const headers = new Headers();
  if (opts.length !== null) headers.set("content-length", opts.length ?? "100");
  // 본문은 실제 직렬화에 맡기지 않는다 — Content-Length 검사는 formData 파싱 전에 끝난다
  return new Request("http://localhost/api/ocr", { method: "POST", body: form, headers });
}
async function errCode(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

describe("createOcrRouteHandler", () => {
  it("엔진이 null 이면 503 OCR_DISABLED", async () => {
    const h = createOcrRouteHandler({ engine: () => null, identify: okAuth });
    const res = await h(post());
    assert.equal(res.status, 503);
    assert.equal(await errCode(res), "OCR_DISABLED");
  });
  it("identify 가 Response 를 돌려주면 그대로 응답", async () => {
    const h = createOcrRouteHandler({
      engine: () => fakeEngine,
      identify: async () => new Response("no", { status: 401 }),
    });
    const res = await h(post());
    assert.equal(res.status, 401);
    assert.equal(await res.text(), "no");
  });
  it("Content-Length 없으면 411", async () => {
    const h = createOcrRouteHandler({ engine: () => fakeEngine, identify: okAuth });
    const req = post({ length: null });
    req.headers.delete("content-length");
    const res = await h(req);
    assert.equal(res.status, 411);
    assert.equal(await errCode(res), "LENGTH_REQUIRED");
  });
  it("Content-Length 가 너무 크면 413", async () => {
    const h = createOcrRouteHandler({ engine: () => fakeEngine, identify: okAuth });
    const res = await h(post({ length: String(10 * 1024 * 1024) }));
    assert.equal(res.status, 413);
    assert.equal(await errCode(res), "PAYLOAD_TOO_LARGE");
  });
  it("지원하지 않는 MIME 은 400", async () => {
    const h = createOcrRouteHandler({ engine: () => fakeEngine, identify: okAuth });
    const res = await h(post({ file: { type: "text/plain", bytes: "hello" } }));
    assert.equal(res.status, 400);
    assert.equal(await errCode(res), "VALIDATION_ERROR");
  });
  it("매직 바이트가 안 맞으면 400", async () => {
    const h = createOcrRouteHandler({ engine: () => fakeEngine, identify: okAuth });
    const res = await h(post({ file: { type: "image/jpeg", bytes: "not a jpeg" } }));
    assert.equal(res.status, 400);
  });
  it("레이트 리밋 초과는 429 (본문을 읽기 전)", async () => {
    const h = createOcrRouteHandler({
      engine: () => fakeEngine,
      identify: okAuth,
      rateLimiter: { check: () => false },
    });
    const res = await h(post());
    assert.equal(res.status, 429);
    assert.equal(await errCode(res), "RATE_LIMITED");
  });
  it("성공 시 { data } 와 사용량 로그(내용 없음)", async () => {
    const logs: unknown[] = [];
    const engine: OcrEngine = {
      async run() {
        return {
          result: { fields: toOcrFields(base), rotation: 0, imageJpegBase64: null },
          usage: { model: "m", calls: 1, inputTokens: 5, outputTokens: 6 },
        };
      },
    };
    const h = createOcrRouteHandler({ engine: () => engine, identify: okAuth, onLog: (e) => logs.push(e) });
    const res = await h(post({ file: { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff, 0xe0, 1, 2] } }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { data: { fields: { merchantName: string } } };
    assert.equal(body.data.fields.merchantName, "가게");
    assert.equal(logs.length, 1);
    assert.deepEqual(Object.keys(logs[0] as object).sort(), ["calls", "inputTokens", "kind", "model", "ms", "outputTokens"]);
  });
});


describe("긴 이미지 타일", () => {
  it("2.5 비율까지는 기존 경로, 그 이상은 긴 방향으로 분할", () => {
    for (const [w, h] of [[100, 100], [100, 250], [250, 100], [0, 100]]) {
      assert.equal(planImageTiles(w, h), null);
    }
    assert.equal(planImageTiles(100, 251)?.direction, "vertical");
    assert.equal(planImageTiles(251, 100)?.direction, "horizontal");
  });
  it("타일 비율 약 1.6 이하, 약 12% 겹침, 빈틈 없이 처음부터 끝까지", () => {
    for (const [w, h] of [[1000, 5000], [5000, 1000]]) {
      const plan = planImageTiles(w, h)!;
      assert.equal(plan.regions.length, 4);
      const vertical = plan.direction === "vertical";
      let end = 0;
      for (const [i, r] of plan.regions.entries()) {
        const start = vertical ? r.top : r.left;
        const length = vertical ? r.height : r.width;
        assert.ok(length / Math.min(w, h) <= 1.601);
        if (i === 0) assert.equal(start, 0);
        else {
          assert.ok(start < end);
          assert.ok(Math.abs((end - start) / length - 0.12) < 0.002);
        }
        end = start + length;
      }
      assert.equal(end, Math.max(w, h));
    }
  });
  it("아무리 길어도 6장으로 전체 범위를 보존한다", () => {
    for (const [w, h] of [[1170, 12000], [12000, 1170], [100, 30000]]) {
      const plan = planImageTiles(w, h)!;
      assert.equal(plan.regions.length, 6);
      const last = plan.regions.at(-1)!;
      assert.equal(last.top + last.height, h);
      assert.equal(last.left + last.width, w);
    }
  });
  it("1170×12000 이미지는 6개 JPEG, 각 긴 변 2000px 이하", async () => {
    const tiled = await tileImageForModel(await makeJpeg(1170, 12000), "image/jpeg");
    assert.ok(tiled);
    assert.equal(tiled.tiles.length, 6);
    assert.equal(tiled.plan.regions[0].top, 0);
    const last = tiled.plan.regions.at(-1)!;
    assert.equal(last.top + last.height, 12000);
    for (const tile of tiled.tiles) {
      const meta = await sharp(tile).metadata();
      assert.equal(meta.format, "jpeg");
      assert.equal(meta.height, 2000);
      assert.ok(meta.width! > 900 && meta.width! <= 2000);
    }
  });
  it("EXIF 회전 후 방향과 좌표를 사용하고 작은 타일은 확대하지 않는다", async () => {
    const src = await sharp(await makeJpeg(600, 100)).withMetadata({ orientation: 6 }).toBuffer();
    const tiled = await tileImageForModel(src, "image/jpeg");
    assert.ok(tiled);
    assert.equal(tiled.plan.direction, "vertical");
    const last = tiled.plan.regions.at(-1)!;
    assert.equal(last.top + last.height, 600);
    for (const tile of tiled.tiles) {
      const meta = await sharp(tile).metadata();
      assert.equal(meta.width, 100);
      assert.ok(meta.height! <= 161);
    }
    assert.equal(await tileImageForModel(await makeJpeg(100, 250), "image/jpeg"), null);
  });
  it("한 요청에 순서대로 보내고 text_top이 돌아가 있어도 재독하지 않는다", async (t) => {
    const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
    t.mock.method(Anthropic.Messages.prototype, "create", async (params: Anthropic.MessageCreateParamsNonStreaming) => {
      requests.push(params);
      return { content: [{ type: "text", text: JSON.stringify(base) }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 6 } };
    });
    // SDK 호출을 통째로 대체한다. 실제 fetch가 일어나면 즉시 실패한다.
    t.mock.method(globalThis, "fetch", () => { throw new Error("네트워크 호출 금지"); });
    for (const [w, h, direction] of [[100, 600, "위에서 아래"], [600, 100, "왼쪽에서 오른쪽"]] as const) {
      const src = await makeJpeg(w, h);
      const expected = await tileImageForModel(src, "image/jpeg");
      const engine = createOcrEngine({ apiKey: "test-only", onLog: () => {} });
      const { result, usage } = await engine.run({ buffer: src, mime: "image/jpeg" });
      assert.equal(usage.calls, 1);
      assert.equal(result.rotation, 0);
      assert.equal(result.imageJpegBase64, null);
      assert.equal(result.fields.totalAmount, 12000.5);
      const content = requests.at(-1)!.messages[0].content;
      assert.ok(Array.isArray(content));
      assert.deepEqual(content.slice(0, -1), expected!.tiles.map((tile) => ({
        type: "image", source: { type: "base64", media_type: "image/jpeg", data: tile.toString("base64") },
      })));
      const instruction = content.at(-1)!;
      assert.equal(instruction.type, "text");
      if (instruction.type === "text") {
        assert.ok(instruction.text.includes(direction));
        assert.ok(instruction.text.includes("중복 집계하지"));
      }
    }
    assert.equal(requests.length, 2);
  });
});
