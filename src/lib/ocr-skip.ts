import { OCR_MAX_UPLOAD_BYTES } from "./ocr-engine/types";

export type OcrSkipReason = "too_large" | "failed";

/** 읽기를 건너뛴 이유. 기능이 꺼진 세션에서는 안내하지 않는다. */
export function getOcrSkipReason(file: { size: number }, disabled: boolean): OcrSkipReason | null {
  if (disabled) return null;
  return file.size > OCR_MAX_UPLOAD_BYTES ? "too_large" : "failed";
}
