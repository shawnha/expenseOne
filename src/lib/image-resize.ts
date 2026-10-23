/**
 * 첨부 사진 업로드 전 브라우저 축소 (클라이언트 전용).
 * 영수증·세금계산서·통장사본 증빙이므로 글자가 또렷하게 남도록 총 900만 화소(≈3000×3000), JPEG 0.9로 제한한다.
 * 긴 변이 아니라 화소 수로 자르는 이유: 세로로 긴 은행·주문 스크린샷(1170×12000 등)을
 * 긴 변 기준으로 줄이면 폭이 300px 아래로 떨어져 글자를 못 읽는다.
 * 실패하면 항상 원본을 그대로 돌려준다 (throw 금지).
 */

/** 총 화소 상한 */
export const MAX_PIXELS = 9_000_000;
/** 긴 변 절대 상한 (px) — Claude API 최대 8000px, 브라우저 캔버스 한도 */
export const MAX_LONG_EDGE = 8000;
/** 이 크기 이하이고 화소 수도 상한 이하이면 손대지 않는다 (바이트) */
export const SKIP_BELOW_BYTES = 1.5 * 1024 * 1024;
/** 출력 JPEG 품질 */
export const JPEG_QUALITY = 0.9;

const RESIZABLE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

/** 축소 대상 이미지 형식인지 (PDF 등은 false) */
export function isShrinkableImage(file: File): boolean {
  return RESIZABLE_TYPES.includes(file.type);
}

/** 총 화소가 maxPixels, 긴 변이 maxLongEdge를 넘지 않게 비율 유지로 줄인다 (확대 없음) */
export function computeTargetSize(
  width: number,
  height: number,
  maxPixels: number = MAX_PIXELS,
  maxLongEdge: number = MAX_LONG_EDGE
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width, height };
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)), maxLongEdge / Math.max(width, height));
  if (scale >= 1) return { width, height };
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

/** 용량이 1.5MB 초과이거나 크기가 상한을 넘을 때만 축소 대상 */
export function shouldShrink(size: number, width: number, height: number): boolean {
  return (
    size > SKIP_BELOW_BYTES || width * height > MAX_PIXELS || Math.max(width, height) > MAX_LONG_EDGE
  );
}

/** HEIC/HEIF는 크롬이 못 그리고 OCR API도 못 받으므로, 브라우저가 읽을 수 있으면 크기와 상관없이 JPEG로 바꾼다 */
export function isHeic(file: File): boolean {
  return file.type === "image/heic" || file.type === "image/heif";
}

/** 확장자를 .jpg로 바꾼 파일명 (기본 이름 유지) */
export function toJpegName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.jpg`;
}

type Drawable = ImageBitmap | HTMLImageElement;

async function decodeImage(
  file: File
): Promise<{ source: Drawable; width: number; height: number; release: () => void } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // 옵션 미지원이거나 디코딩 실패 → <img> 경로로 재시도
    }
  }
  if (typeof document === "undefined" || typeof URL === "undefined") return null;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

async function encodeJpeg(source: Drawable, width: number, height: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff"; // PNG 투명 영역 → JPEG 흰 배경
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = "high"; // 작은 영수증 글씨가 깨지지 않게
      ctx.drawImage(source, 0, 0, width, height);
      try {
        return await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
      } finally {
        canvas.width = canvas.height = 0;
      }
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) =>
    canvas.toBlob((blob) => {
      canvas.width = canvas.height = 0; // iOS는 캔버스 메모리를 늦게 회수한다
      resolve(blob);
    }, "image/jpeg", JPEG_QUALITY)
  );
}

/** 업로드 전 사진 축소. 이미지가 아니거나 축소 불필요/실패 시 원본 반환 */
export async function shrinkImageForUpload(file: File): Promise<File> {
  try {
    if (!isShrinkableImage(file)) return file;

    const decoded = await decodeImage(file);
    if (!decoded) return file; // HEIC 등 브라우저가 못 읽는 형식은 서버에서 변환
    try {
      const { width, height } = decoded;
      if (!(width > 0) || !(height > 0)) return file;
      const heic = isHeic(file);
      if (!heic && !shouldShrink(file.size, width, height)) return file;

      const target = computeTargetSize(width, height);
      const blob = await encodeJpeg(decoded.source, target.width, target.height);
      if (!blob || blob.size === 0) return file;
      // 줄였는데 오히려 커지면 원본 유지 (HEIC는 호환성이 목적이라 예외)
      if (!heic && blob.size >= file.size) return file;

      return new File([blob], toJpegName(file.name), {
        type: "image/jpeg",
        lastModified: file.lastModified,
      });
    } finally {
      decoded.release();
    }
  } catch {
    return file;
  }
}
