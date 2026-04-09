/**
 * Codef connectedId at-rest 암호화
 *
 * Codef 가 발급한 connectedId 는 사용자 카드사 데이터에 접근할 수 있는
 * bearer token 이다. DB 에 평문 저장 금지.
 *
 * 알고리즘: AES-256-GCM
 * - 12-byte random IV
 * - 16-byte auth tag (GCM)
 * - Format: base64( iv || ciphertext || authTag )
 *
 * Key: CODEF_CONNECTED_ID_KEY env var (base64-encoded 32 bytes)
 *      `openssl rand -base64 32` 로 생성
 *
 * Key rotation: MVP 에서는 단일 키 고정. 추후 keyVersion 컬럼 추가 가능.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.CODEF_CONNECTED_ID_KEY;
  if (!raw) {
    throw new Error(
      "CODEF_CONNECTED_ID_KEY 환경변수가 설정되지 않았습니다. " +
        "openssl rand -base64 32 로 생성하여 .env.local 에 추가하세요.",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `CODEF_CONNECTED_ID_KEY 길이 오류: 32 bytes 필요 (현재 ${buf.length} bytes)`,
    );
  }
  cachedKey = buf;
  return buf;
}

export function encryptConnectedId(plain: string): string {
  if (!plain || typeof plain !== "string") {
    throw new Error("encryptConnectedId: plain text 가 비어있습니다");
  }
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString("base64");
}

export function decryptConnectedId(encoded: string): string {
  if (!encoded || typeof encoded !== "string") {
    throw new Error("decryptConnectedId: encoded text 가 비어있습니다");
  }
  const key = getKey();
  const buf = Buffer.from(encoded, "base64");
  if (buf.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("decryptConnectedId: 잘못된 암호문 형식");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
