/**
 * OCR용 이미지 전처리 (서버 전용). sharp + heic-convert.
 */
import sharp from "sharp";
import convert from "heic-convert";
import { computeTargetSize } from "@/lib/image-resize";

export type Degrees = 0 | 90 | 180 | 270;

/** 디코드 화소 상한 (압축 폭탄 방어) */
export const LIMIT_INPUT_PIXELS = 40_000_000;
/** 클라이언트로 돌려주는 JPEG 바이트 상한 (Vercel 응답 4.5MB 한도, base64 +33% 감안) */
export const MAX_OUTPUT_BYTES = 3_200_000;

const sharpOpts = { limitInputPixels: LIMIT_INPUT_PIXELS };

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

export function isHeicMime(mime: string): boolean {
  return mime === "image/heic" || mime === "image/heif";
}

/** 선언한 MIME과 실제 파일 앞부분(매직 바이트)이 맞는지 */
export function verifyMagic(buf: Uint8Array, mime: string): boolean {
  const starts = (sig: number[], off = 0) => sig.every((b, i) => buf[off + i] === b);
  switch (mime) {
    case "image/jpeg":
      return buf.length >= 3 && starts([0xff, 0xd8, 0xff]);
    case "image/png":
      return buf.length >= 8 && starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return buf.length >= 12 && starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8);
    case "application/pdf":
      return buf.length >= 4 && starts([0x25, 0x50, 0x44, 0x46]);
    case "image/heic":
    case "image/heif": {
      if (buf.length < 12 || !starts([0x66, 0x74, 0x79, 0x70], 4)) return false;
      const brand = (o: number) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
      if (!HEIC_BRANDS.has(brand(8))) return false;
      // mif1/msf1 은 AVIF 도 쓰는 범용 브랜드 — 호환 브랜드에 avif 가 있으면 HEIC 가 아니다
      const boxEnd = Math.min(buf.length, ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0);
      for (let o = 16; o + 4 <= boxEnd; o += 4) {
        const b = brand(o);
        if (b === "avif" || b === "avis") return false;
      }
      return true;
    }
    default:
      return false;
  }
}

export async function heicToJpeg(buffer: Buffer): Promise<Buffer> {
  const out = await convert({ buffer: new Uint8Array(buffer), format: "JPEG", quality: 0.92 });
  return Buffer.from(out);
}

async function decodable(buffer: Buffer, mime: string): Promise<Buffer> {
  return isHeicMime(mime) ? heicToJpeg(buffer) : buffer;
}

/** 모델에 보낼 사본: EXIF 회전 적용, 긴 변 2000px 이내, JPEG 85 */
export async function toJpegForModel(buffer: Buffer, mime: string): Promise<Buffer> {
  const src = await decodable(buffer, mime);
  return sharp(src, sharpOpts)
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** 모델 사본을 시계 방향으로 degrees만큼 돌린다 */
export async function rotateJpeg(buffer: Buffer, degrees: Degrees): Promise<Buffer> {
  if (degrees === 0) return buffer;
  return sharp(buffer, sharpOpts).rotate(degrees).jpeg({ quality: 85 }).toBuffer();
}

/**
 * 화면에 돌려줄 JPEG(base64). 900만 화소 상한, 품질 90, 바이트가 크면 품질·크기를 낮춘다.
 * 한 파이프라인(autoOrient + rotate)으로 한 번만 인코딩한다.
 */
export async function makeOutputImage(
  originalBuffer: Buffer,
  mime: string,
  extraRotation: Degrees
): Promise<string> {
  const src = await decodable(originalBuffer, mime);
  const meta = await sharp(src, sharpOpts).metadata();
  let w = meta.width ?? 0;
  let h = meta.height ?? 0;
  if ((meta.orientation ?? 1) >= 5) [w, h] = [h, w];
  if (extraRotation === 90 || extraRotation === 270) [w, h] = [h, w];

  const encode = async (size: { width: number; height: number }, quality: number) => {
    let p = sharp(src, { ...sharpOpts, autoOrient: true });
    if (extraRotation !== 0) p = p.rotate(extraRotation);
    if (size.width !== w || size.height !== h) {
      p = p.resize({ width: size.width, height: size.height, fit: "fill" });
    }
    return p.jpeg({ quality }).toBuffer();
  };

  let size = computeTargetSize(w, h);
  let out = await encode(size, 90);
  for (const q of [80, 70]) {
    if (out.length <= MAX_OUTPUT_BYTES) break;
    out = await encode(size, q);
  }
  // 그래도 크면 화소를 줄인다
  for (let i = 0; i < 3 && out.length > MAX_OUTPUT_BYTES; i++) {
    size = { width: Math.max(1, Math.floor(size.width * 0.75)), height: Math.max(1, Math.floor(size.height * 0.75)) };
    out = await encode(size, 75);
  }
  return out.toString("base64");
}
