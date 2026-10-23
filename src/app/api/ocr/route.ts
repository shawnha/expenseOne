import { NextRequest, NextResponse } from "next/server";
import { errorResponse, handleError, requireAuth, validateOrigin } from "@/lib/api-utils";
import { runOcr, OcrInputError, OcrUpstreamError } from "@/lib/ocr/extract";
import { verifyMagic } from "@/lib/ocr/image";
import { checkRateLimit } from "@/lib/ocr/rate-limit";
import {
  OCR_ACCEPTED_TYPES,
  OCR_DISABLED_CODE,
  OCR_MAX_UPLOAD_BYTES,
  type OcrResponse,
} from "@/lib/ocr/types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const originError = validateOrigin(request);
    if (originError) return originError;

    const user = await requireAuth();

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: { code: OCR_DISABLED_CODE, message: "증빙 자동 인식이 꺼져 있습니다." } },
        { status: 503 },
      );
    }

    // 본문을 읽기 전에 센다. 인스턴스별 best-effort (서버리스에서는 인스턴스마다 따로 센다)
    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." } },
        { status: 429 },
      );
    }

    const declaredLength = Number(request.headers.get("content-length"));
    if (!Number.isFinite(declaredLength) || declaredLength <= 0) {
      return NextResponse.json(
        { error: { code: "LENGTH_REQUIRED", message: "요청 크기를 확인할 수 없습니다." } },
        { status: 411 },
      );
    }
    if (declaredLength > OCR_MAX_UPLOAD_BYTES + 64 * 1024) {
      return NextResponse.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "파일이 너무 큽니다. 4MB 이하로 올려 주세요." } },
        { status: 413 },
      );
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return errorResponse("VALIDATION_ERROR", "요청 형식이 올바르지 않습니다.");
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return errorResponse("VALIDATION_ERROR", "파일이 없습니다.");
    }
    if (!(OCR_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
      return errorResponse("VALIDATION_ERROR", "지원하지 않는 파일 형식입니다. (JPG, PNG, WebP, HEIC, PDF)");
    }
    if (file.size === 0) {
      return errorResponse("VALIDATION_ERROR", "빈 파일입니다.");
    }
    if (file.size > OCR_MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: { code: "PAYLOAD_TOO_LARGE", message: "파일이 너무 큽니다. 4MB 이하로 올려 주세요." } },
        { status: 413 },
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!verifyMagic(buffer, file.type)) {
      return errorResponse("VALIDATION_ERROR", "파일 내용이 형식과 일치하지 않습니다.");
    }

    const started = Date.now();
    const { result, usage } = await runOcr({ buffer, mime: file.type });
    // 문서 내용은 로그에 남기지 않는다
    console.info("[ocr]", {
      ms: Date.now() - started,
      model: usage.model,
      calls: usage.calls,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });

    const body: OcrResponse = { data: result };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof OcrInputError) {
      return errorResponse("VALIDATION_ERROR", err.message);
    }
    if (err instanceof OcrUpstreamError) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 502 });
    }
    return handleError(err);
  }
}
