import type { ZodType } from "zod";
import { AppError, validateUploadFile } from "@/services/attachment.service";
import type { AuthUser } from "@/lib/api-utils";
import type { Actor } from "@/services/tax-invoice.service";
import { MAX_TAX_INVOICE_ATTACHMENT_BYTES, taxInvoiceAttachmentLimit } from "@/lib/tax-invoice-attachments";

// 세금계산서 라우트 공용: 본문 검증 + AuthUser → Actor.

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "요청 본문을 읽을 수 없습니다.");
  }
  return validateBody(json, schema);
}

function validateBody<T>(body: unknown, schema: ZodType<T>): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "));
  }
  return parsed.data;
}

export async function parseTaxInvoiceRequest<T>(request: Request, schema: ZodType<T>): Promise<{ input: T; files: File[] }> {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    return { input: await parseBody(request, schema), files: [] };
  }
  const length = Number(request.headers.get("content-length"));
  if (!Number.isFinite(length) || length <= 0 || length > MAX_TAX_INVOICE_ATTACHMENT_BYTES + 128 * 1024) {
    throw new AppError("VALIDATION_ERROR", "첨부 파일 합계가 4MB 이하인지 확인해 주세요.");
  }
  let form: FormData;
  let body: unknown;
  try {
    form = await request.formData();
    body = JSON.parse(String(form.get("payload")));
  } catch {
    throw new AppError("VALIDATION_ERROR", "요청 본문이나 첨부 파일을 읽을 수 없습니다.");
  }
  const input = validateBody(body, schema);
  const files = form.getAll("files");
  if (!files.every((file): file is File => file instanceof File && file.size > 0)) {
    throw new AppError("VALIDATION_ERROR", "첨부 파일을 다시 선택해 주세요.");
  }
  const limitError = taxInvoiceAttachmentLimit(files.map((file) => ({ fileSize: file.size })));
  if (limitError) throw new AppError("VALIDATION_ERROR", limitError);
  await Promise.all(files.map(validateUploadFile));
  return { input, files };
}

export function toActor(user: AuthUser): Actor {
  return { id: user.id, name: user.name, role: user.role };
}
