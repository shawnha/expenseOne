/**
 * POST 업로드 → OCR → JSON 응답. 표준 Web Request/Response 만 쓴다 (next/* 의존 없음).
 * 인증은 앱이 identify 훅으로 꽂는다.
 */
import { OcrInputError, OcrUpstreamError, type OcrEngine, type OcrLogEvent } from "./extract";
import { verifyMagic } from "./image";
import { createRateLimiter, type RateLimiter } from "./rate-limit";
import { OCR_ACCEPTED_TYPES, OCR_DISABLED_CODE, OCR_MAX_UPLOAD_BYTES, type OcrResponse } from "./types";

export interface OcrRouteHandlerOptions {
  /** 엔진을 돌려준다. null 이면 기능 꺼짐 → 503 OCR_DISABLED */
  engine: () => OcrEngine | null;
  /** 인증 훅. { key } 는 레이트 리밋 키(보통 사용자 id), Response 를 돌려주면 그대로 응답한다 */
  identify: (req: Request) => Promise<{ key: string } | Response>;
  /** 기본: 30회 / 10분 */
  rateLimiter?: Pick<RateLimiter, "check">;
  /** 기본 OCR_MAX_UPLOAD_BYTES (4MB) */
  maxUploadBytes?: number;
  /** 로그 훅. 기본은 console (usage → info "[ocr]") */
  onLog?: (event: OcrLogEvent) => void;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const err = (code: string, message: string, status: number) => json({ error: { code, message } }, status);
const validation = (message: string) => err("VALIDATION_ERROR", message, 400);

export function createOcrRouteHandler(options: OcrRouteHandlerOptions): (req: Request) => Promise<Response> {
  const maxBytes = options.maxUploadBytes ?? OCR_MAX_UPLOAD_BYTES;
  const limiter = options.rateLimiter ?? createRateLimiter();
  const tooLarge = () => err("PAYLOAD_TOO_LARGE", "파일이 너무 큽니다. 4MB 이하로 올려 주세요.", 413);

  return async function handle(request: Request): Promise<Response> {
    try {
      const who = await options.identify(request);
      if (who instanceof Response) return who;

      const engine = options.engine();
      if (!engine) return err(OCR_DISABLED_CODE, "증빙 자동 인식이 꺼져 있습니다.", 503);

      // 본문을 읽기 전에 센다. 인스턴스별 best-effort (서버리스에서는 인스턴스마다 따로 센다)
      if (!limiter.check(who.key)) {
        return err("RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
      }

      const declaredLength = Number(request.headers.get("content-length"));
      if (!Number.isFinite(declaredLength) || declaredLength <= 0) {
        return err("LENGTH_REQUIRED", "요청 크기를 확인할 수 없습니다.", 411);
      }
      if (declaredLength > maxBytes + 64 * 1024) return tooLarge();

      let form: FormData;
      try {
        form = await request.formData();
      } catch {
        return validation("요청 형식이 올바르지 않습니다.");
      }
      const file = form.get("file");
      if (!(file instanceof File)) return validation("파일이 없습니다.");
      if (!(OCR_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
        return validation("지원하지 않는 파일 형식입니다. (JPG, PNG, WebP, HEIC, PDF)");
      }
      if (file.size === 0) return validation("빈 파일입니다.");
      if (file.size > maxBytes) return tooLarge();
      const buffer = Buffer.from(await file.arrayBuffer());
      if (!verifyMagic(buffer, file.type)) return validation("파일 내용이 형식과 일치하지 않습니다.");

      const started = Date.now();
      const { result, usage } = await engine.run({ buffer, mime: file.type });
      // 문서 내용은 로그에 남기지 않는다
      const usageLog = {
        ms: Date.now() - started,
        model: usage.model,
        calls: usage.calls,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      };
      if (options.onLog) options.onLog({ kind: "usage", ...usageLog });
      else console.info("[ocr]", usageLog);

      const body: OcrResponse = { data: result };
      return json(body, 200);
    } catch (e) {
      if (e instanceof OcrInputError) return validation(e.message);
      if (e instanceof OcrUpstreamError) return err(e.code, e.message, 502);
      console.error("Unhandled error:", e);
      return err("INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.", 500);
    }
  };
}
