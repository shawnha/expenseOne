/**
 * 증빙 OCR — 서버(/api/ocr)와 화면이 같이 쓰는 계약.
 * 결과는 저장하지 않는다. 화면이 빈 칸을 채우거나 경고를 띄우는 데만 쓴다.
 */

/** 문서 종류 (모델이 고르는 값) */
export const OCR_DOC_TYPES = [
  "카드전표/영수증",
  "견적서",
  "청구서/인보이스",
  "거래명세서",
  "통장사본",
  "사업자등록증",
  "신분증",
  "세금계산서",
  "기타",
] as const;
export type OcrDocType = (typeof OCR_DOC_TYPES)[number];

/** 이미지를 시계 방향으로 몇 도 돌려야 글자가 바로 서는지 */
export type OcrRotation = 0 | 90 | 180 | 270;

export interface OcrFields {
  docType: OcrDocType;
  /** 돈을 받는 쪽 상호 (우리 회사 아님) */
  merchantName: string | null;
  /** 문서의 최종 합계. KRW는 원, 외화는 그 통화 단위(USD 22.5 → 22.5) */
  totalAmount: number | null;
  /** totalAmount가 부가세 포함 금액인지 — "no"면 VAT 별도 금액만 적힌 문서 */
  amountIncludesVat: "yes" | "no" | "unknown";
  /**
   * 공급가액·부가세가 따로 적혀 있으면 각각 (없으면 null). 모델 출력 이름은 supply_amount / vat_amount.
   * 화면은 이 둘로 입금요청 폼의 부가세 방식(별도/포함)을 맞춰 넣는다.
   */
  supplyAmount: number | null;
  vatAmount: number | null;
  /** ISO 통화 코드 (KRW, USD …) */
  currency: string | null;
  /** 문서의 대표 날짜 YYYY-MM-DD */
  date: string | null;
  bankName: string | null;
  accountHolder: string | null;
  /** 문서 표기 그대로 (하이픈 포함) */
  accountNumber: string | null;
  cardLast4: string | null;
  confidence: "high" | "medium" | "low";
  /** 특이사항 한 줄 (손글씨, 여러 금액 중 고른 근거 등) */
  note: string;
}

export interface OcrResult {
  fields: OcrFields;
  /** 원본에서 바로 세우려고 돌린 각도 (PDF는 항상 0) */
  rotation: OcrRotation;
  /**
   * 서버가 이미지를 바꿨을 때만(회전했거나 HEIC를 JPEG로 바꿨을 때) 바뀐 JPEG를 base64로 돌려준다.
   * 화면은 이 이미지로 첨부 파일을 바꿔 끼운다 — 저장되는 사진도 바로 선다.
   */
  imageJpegBase64: string | null;
}

/** POST /api/ocr 응답 — 성공 { data: OcrResult }, 실패 { error: { code, message } } */
export type OcrResponse = { data: OcrResult };

/** 요청 본문 상한. Vercel 함수 요청 본문 한도(4.5MB)보다 여유 있게 */
export const OCR_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** OCR에 보낼 수 있는 형식 */
export const OCR_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

/** 기능이 꺼져 있을 때(키 없음) 서버가 돌려주는 오류 코드 — 화면은 조용히 건너뛴다 */
export const OCR_DISABLED_CODE = "OCR_DISABLED";
