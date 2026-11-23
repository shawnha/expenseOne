import { NextRequest } from "next/server";
import { handleError, requireAuth, validateOrigin } from "@/lib/api-utils";
import { createOcrEngine, createOcrRouteHandler } from "@/lib/ocr-engine";

export const maxDuration = 60;

// 엔진은 한 번만 만든다 (Anthropic 클라이언트는 첫 호출 때 만들어진다)
const engines = new Map<string, ReturnType<typeof createOcrEngine>>();
function getEngine(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const purpose = new URL(request.url).searchParams.get("purpose") === "tax-invoice" ? "tax-invoice" : undefined;
  const key = purpose ?? "expense";
  const cached = engines.get(key);
  if (cached) return cached;
  const engine = createOcrEngine({
    apiKey,
    model: process.env.OCR_MODEL || undefined,
    purpose,
    context: "한국 회사(한아원·하나원 계열, 글리프 등 브랜드 포함) 직원이 비용 처리용으로 올린 증빙",
  });
  engines.set(key, engine);
  return engine;
}

const ocrHandler = createOcrRouteHandler({
  engine: getEngine,
  // 인증은 앱 몫: 실패(AppError)는 기존 handleError 로 같은 응답을 만든다
  identify: async () => {
    try {
      const user = await requireAuth();
      return { key: user.id };
    } catch (err) {
      return handleError(err);
    }
  },
});

export async function POST(request: NextRequest) {
  const originError = validateOrigin(request);
  if (originError) return originError;
  return ocrHandler(request);
}
