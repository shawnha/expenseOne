/**
 * Claude로 증빙 필드를 추출한다 (서버 전용). 결과는 저장하지 않는다.
 * createOcrEngine(config) 로 엔진을 만들어 run({ buffer, mime }) 을 부른다.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { OCR_SYSTEM, buildOcrPrompt, ocrModelSchema, toOcrFields, toRotation } from "./prompt";
import { heicToJpeg, isHeicMime, makeOutputImage, rotateJpeg, toJpegForModel, type Degrees } from "./image";
import type { OcrFields, OcrResult } from "./types";

/** 모델 호출 실패 — 핸들러가 502로 매핑한다 */
export class OcrUpstreamError extends Error {
  readonly status = 502;
  readonly code = "OCR_UPSTREAM_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "OcrUpstreamError";
  }
}

/** 사용자 입력 문제(읽을 수 없는 이미지, 너무 큰 PDF) — 핸들러가 400 으로 매핑한다 */
export class OcrInputError extends Error {
  readonly status = 400;
  readonly code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "OcrInputError";
  }
}

export const OCR_DEFAULT_MODEL = "claude-sonnet-5-5";
export const OCR_DEFAULT_DEADLINE_MS = 30_000;

/** 다시 읽기를 시작하기 위해 남아 있어야 하는 최소 시간 */
const PASS2_MIN_REMAINING_MS = 8_000;
/** 바로 세워 다시 읽는 횟수 상한 (첫 읽기 포함 최대 3번) */
const MAX_REREADS = 2;
/** PDF 입력 토큰 상한 (페이지 많은 PDF 비용 방어) */
const PDF_MAX_INPUT_TOKENS = 30_000;
const MAX_TOKENS = 4000;

export interface OcrUsage {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

/** 로그 이벤트. 문서 내용은 절대 담지 않는다 (이름·상태·토큰 수만). */
export type OcrLogEvent = { kind: "usage" | "error"; [k: string]: unknown };

export interface OcrEngineConfig {
  apiKey: string;
  /** 기본 claude-sonnet-5-5 */
  model?: string;
  /** 기본 "low" */
  effort?: "low" | "medium" | "high";
  /** 프롬프트의 "이 파일은 ○○입니다" 앞부분 */
  context?: string;
  /** 모델 호출 전체 시한. 기본 30000 (maxDuration 60s 안에서 끝나도록) */
  deadlineMs?: number;
  /** 로그 훅. 기본은 console (usage → info "[ocr]", error → error "[ocr] ...") */
  onLog?: (event: OcrLogEvent) => void;
}

export interface OcrEngine {
  run(input: { buffer: Buffer; mime: string }): Promise<{ result: OcrResult; usage: OcrUsage }>;
}

/** 기본 로거: 오늘 ExpenseOne 이 남기는 줄과 같은 형태 */
export function defaultOcrLog(event: OcrLogEvent): void {
  const { kind, message, ...rest } = event;
  if (kind === "usage") console.info("[ocr]", rest);
  else console.error(`[ocr] ${String(message ?? "error")}`, rest);
}

type MediaBlock = Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam;

export function createOcrEngine(config: OcrEngineConfig): OcrEngine {
  const model = config.model || OCR_DEFAULT_MODEL;
  const effort = config.effort ?? "low";
  const deadlineMs = config.deadlineMs ?? OCR_DEFAULT_DEADLINE_MS;
  const log = config.onLog ?? defaultOcrLog;
  const prompt = buildOcrPrompt({ context: config.context });

  let client: Anthropic | null = null;
  function getClient(): Anthropic {
    if (!config.apiKey) throw new OcrUpstreamError("OCR 기능이 설정되지 않았습니다.");
    if (!client) client = new Anthropic({ apiKey: config.apiKey, maxRetries: 0 });
    return client;
  }

  async function callModel(
    media: MediaBlock,
    usage: OcrUsage,
    deadline: number
  ): Promise<{ fields: OcrFields; rotation: Degrees }> {
    const c = getClient();
    const remaining = Math.max(1000, deadline - Date.now());
    let response: Anthropic.Message;
    try {
      // messages.parse 는 zod 파싱 실패까지 한 catch 로 섞이므로 create + 직접 파싱한다
      response = await c.messages.create(
        {
          model: usage.model,
          max_tokens: MAX_TOKENS,
          system: OCR_SYSTEM,
          messages: [{ role: "user", content: [media, { type: "text", text: prompt }] }],
          output_config: { effort, format: zodOutputFormat(ocrModelSchema) },
        },
        { signal: AbortSignal.timeout(remaining) }
      );
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      const status = (err as { status?: number }).status;
      log({ kind: "error", message: "upstream error", name, status });
      throw new OcrUpstreamError("증빙 인식 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    usage.calls += 1;
    usage.inputTokens += response.usage?.input_tokens ?? 0;
    usage.outputTokens += response.usage?.output_tokens ?? 0;
    if (response.stop_reason === "refusal") throw new OcrUpstreamError("이 문서는 자동 인식할 수 없습니다.");
    if (response.stop_reason === "max_tokens") throw new OcrUpstreamError("증빙 인식 결과를 해석하지 못했습니다.");
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    let parsed;
    try {
      parsed = ocrModelSchema.safeParse(JSON.parse(textBlock?.text ?? ""));
    } catch {
      parsed = null;
    }
    if (!parsed || !parsed.success) throw new OcrUpstreamError("증빙 인식 결과를 해석하지 못했습니다.");
    return { fields: toOcrFields(parsed.data), rotation: toRotation(parsed.data.text_top) };
  }

  async function run(input: {
    buffer: Buffer;
    mime: string;
  }): Promise<{ result: OcrResult; usage: OcrUsage }> {
    const usage: OcrUsage = { model, calls: 0, inputTokens: 0, outputTokens: 0 };
    const deadline = Date.now() + deadlineMs;
    const { mime } = input;
    let buffer = input.buffer;

    if (mime === "application/pdf") {
      const block: Anthropic.DocumentBlockParam = {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
      };
      // 페이지 수가 많으면 비용이 커진다 — 토큰 수(무료)로 먼저 확인. 실패하면 건너뛴다.
      try {
        const counted = await getClient().messages.countTokens(
          { model: usage.model, messages: [{ role: "user", content: [block] }] },
          { signal: AbortSignal.timeout(10_000) }
        );
        if (counted.input_tokens > PDF_MAX_INPUT_TOKENS) {
          throw new OcrInputError("PDF가 너무 깁니다. 첫 몇 페이지만 올려 주세요.");
        }
      } catch (err) {
        if (err instanceof OcrInputError) throw err;
      }
      const { fields } = await callModel(block, usage, deadline);
      return { result: { fields, rotation: 0, imageJpegBase64: null }, usage };
    }

    const imageBlock = (jpeg: Buffer): Anthropic.ImageBlockParam => ({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") },
    });

    const wasHeic = isHeicMime(mime);
    let modelJpeg: Buffer;
    try {
      // HEIC 는 한 번만 디코드해서 이후 모든 단계에 JPEG 로 넘긴다
      if (wasHeic) buffer = await heicToJpeg(buffer);
      modelJpeg = await toJpegForModel(buffer, "image/jpeg");
    } catch {
      throw new OcrInputError("이미지를 읽을 수 없습니다. 다른 사진으로 시도해 주세요.");
    }

    // 돌아간 사진은 바로 세운 사본으로 다시 읽는다 — 돌아간 채로 읽은 값은 믿을 수 없다(실측).
    // 세운 사본에서도 아직 돌아가 있다고 하면(방향을 잘못 짚은 경우) 한 번 더 고쳐 읽는다.
    let pass = await callModel(imageBlock(modelJpeg), usage, deadline);
    let rotation: Degrees = 0;
    let fields: OcrFields = pass.fields;
    for (let i = 0; i < MAX_REREADS && pass.rotation !== 0; i++) {
      const next = ((rotation + pass.rotation) % 360) as Degrees;
      try {
        if (deadline - Date.now() < PASS2_MIN_REMAINING_MS) throw new OcrUpstreamError("시간 부족");
        const rotated = await rotateJpeg(modelJpeg, next);
        pass = await callModel(imageBlock(rotated), usage, deadline);
        rotation = next;
        fields = pass.fields;
      } catch (err) {
        if (!(err instanceof OcrUpstreamError)) throw err;
        break;
      }
    }
    // 끝까지 바로 서지 않았거나 다시 읽기에 실패했으면 낮은 신뢰도로 돌려준다
    if (pass.rotation !== 0) fields = { ...fields, confidence: "low" };

    let imageJpegBase64: string | null = null;
    if (rotation !== 0 || wasHeic) {
      try {
        imageJpegBase64 = await makeOutputImage(buffer, "image/jpeg", rotation);
      } catch (err) {
        // 필드는 이미 얻었으니 이미지만 포기한다 (화면이 원본을 그대로 쓴다)
        log({ kind: "error", message: "output image failed", name: err instanceof Error ? err.name : "" });
      }
    }
    return { result: { fields, rotation, imageJpegBase64 }, usage };
  }

  return { run };
}
