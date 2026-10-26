import { OCR_MAX_UPLOAD_BYTES } from "./ocr-engine/types";

export type OcrSkipReason = "too_large" | "failed";

/** 읽기를 건너뛴 이유. 기능이 꺼진 세션에서는 안내하지 않는다. */
export function getOcrSkipReason(file: { size: number }, disabled: boolean): OcrSkipReason | null {
  if (disabled) return null;
  return file.size > OCR_MAX_UPLOAD_BYTES ? "too_large" : "failed";
}

/** 파일 줄 아래 한 줄 안내. 금액이 없는 서류(통장사본 등)에도 맞게 「필요한 값」이라고 쓴다. */
export function ocrSkipMessage(reason: OcrSkipReason): string {
  return reason === "too_large"
    ? "크기가 커서 자동 인식은 건너뛰었습니다. 필요한 값은 직접 입력해주세요."
    : "자동 인식을 하지 못했습니다. 필요한 값은 직접 입력해주세요.";
}

/** 화면 읽기 프로그램에 알릴 문장 — 어느 파일인지 이름을 붙인다. 건너뛴 파일이 없으면 빈 문자열. */
export function ocrSkipAnnouncement(
  files: { id: string; name: string }[],
  skipped: Partial<Record<string, OcrSkipReason>>,
): string {
  return files
    .flatMap((f) => (skipped[f.id] ? [`${f.name}: ${ocrSkipMessage(skipped[f.id]!)}`] : []))
    .join(" ");
}
