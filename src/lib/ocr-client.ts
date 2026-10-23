/**
 * 화면 쪽 증빙 OCR 호출 (클라이언트 전용).
 * 실패·꺼짐·시간 초과면 항상 null — 첨부는 OCR 없이 그대로 진행한다 (throw 금지).
 */
import {
  OCR_ACCEPTED_TYPES,
  OCR_MAX_UPLOAD_BYTES,
  type OcrDocType,
  type OcrResult,
} from "@/lib/ocr/types";
import { toJpegName } from "@/lib/image-resize";

/** 화면이 기다리는 최대 시간. 넘으면 OCR 없이 첨부만 한다 */
const CLIENT_TIMEOUT_MS = 30_000;

// 한 번 꺼져 있다고(503) 확인되면 이 페이지에서는 다시 묻지 않는다
let disabledForSession = false;

export function canReadDocument(file: File): boolean {
  return (
    !disabledForSession &&
    (OCR_ACCEPTED_TYPES as readonly string[]).includes(file.type) &&
    file.size > 0 &&
    file.size <= OCR_MAX_UPLOAD_BYTES
  );
}

export async function readDocument(file: File): Promise<OcrResult | null> {
  if (!canReadDocument(file)) return null;
  try {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/ocr", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
    if (res.status === 503) {
      disabledForSession = true;
      return null;
    }
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: OcrResult };
    return json.data ?? null;
  } catch {
    return null;
  }
}

/** 서버가 돌려준(회전·HEIC 변환한) JPEG로 바꿔 끼울 파일 */
export function fileFromOcrImage(original: File, base64: string): File | null {
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], toJpegName(original.name), {
      type: "image/jpeg",
      lastModified: original.lastModified,
    });
  } catch {
    return null;
  }
}

/** OCR 문서 종류 → 입금요청 첨부 종류 (모르면 undefined — 직원이 고른다) */
export function documentTypeFromOcr(docType: OcrDocType): string | undefined {
  switch (docType) {
    case "카드전표/영수증":
      return "RECEIPT";
    case "견적서":
      return "ESTIMATE";
    case "통장사본":
      return "BANK_COPY";
    case "사업자등록증":
      return "BIZ_LICENSE";
    case "신분증":
      return "ID_CARD";
    default:
      return undefined;
  }
}
