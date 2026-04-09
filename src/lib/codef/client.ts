/**
 * Codef SDK 싱글톤 래퍼
 *
 * 환경별 분기:
 * - CODEF_ENV=demo    → setClientInfoForDemo + DEMO_DOMAIN (development.codef.io)
 * - CODEF_ENV=product → setClientInfo + API_DOMAIN (api.codef.io)
 *
 * Codef SDK 응답은 URL-encoded JSON 문자열. 한글 처리를 위해 decodeURIComponent + JSON.parse 필요.
 */

import codefPkg from "easycodef-node";
const { EasyCodef, EasyCodefConstant, EasyCodefUtil } = codefPkg;

let _codef: InstanceType<typeof EasyCodef> | null = null;

export function getCodefClient(): InstanceType<typeof EasyCodef> {
  if (_codef) return _codef;

  const clientId = process.env.CODEF_CLIENT_ID;
  const clientSecret = process.env.CODEF_CLIENT_SECRET;
  const publicKey = process.env.CODEF_PUBLIC_KEY;

  if (!clientId || !clientSecret || !publicKey) {
    throw new Error(
      "Codef 환경변수 누락: CODEF_CLIENT_ID, CODEF_CLIENT_SECRET, CODEF_PUBLIC_KEY",
    );
  }

  const env = process.env.CODEF_ENV ?? "demo";
  const codef = new EasyCodef();

  if (env === "product") {
    codef.setClientInfo(clientId, clientSecret);
  } else {
    codef.setClientInfoForDemo(clientId, clientSecret);
  }
  codef.setPublicKey(publicKey);

  _codef = codef;
  return codef;
}

export function getServiceType(): number {
  const env = process.env.CODEF_ENV ?? "demo";
  if (env === "product") return EasyCodefConstant.SERVICE_TYPE_API;
  if (env === "sandbox") return EasyCodefConstant.SERVICE_TYPE_SANDBOX;
  return EasyCodefConstant.SERVICE_TYPE_DEMO;
}

/**
 * Codef SDK 응답 파싱.
 * SDK 는 URL-encoded JSON 문자열을 리턴함 (한글 대응).
 */
export function parseCodefResponse<T = unknown>(raw: string): {
  result: { code: string; message: string; extraMessage?: string };
  data: T;
} {
  // 어떤 응답은 이미 디코딩됨, 어떤 응답은 URL-encoded 상태
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // 이미 디코딩된 경우 그대로 사용
  }
  return JSON.parse(decoded);
}

export { EasyCodefUtil };
export const CODEF_PRODUCT_URL = {
  /** 개인 카드 승인내역 조회 (실시간 가까움) */
  PERSONAL_CARD_APPROVAL: "/v1/kr/card/p/account/approval-list",
  /** 개인 카드 청구내역 조회 (정산 후, T+1~T+3) */
  PERSONAL_CARD_BILLING: "/v1/kr/card/p/account/billing-list",
  /** 보유 카드 목록 */
  PERSONAL_CARD_LIST: "/v1/kr/card/p/account/card-list",
} as const;

/**
 * Codef 카드사 코드 매핑.
 * organization 파라미터에 사용. UI 에서 사용자가 선택.
 *
 * 참고: https://developer.codef.io/products/card 참고
 */
export const CARD_COMPANY_CODES = {
  shinhan: { code: "0306", name: "신한카드" },
  hyundai: { code: "0301", name: "현대카드" },
  samsung: { code: "0302", name: "삼성카드" },
  kb: { code: "0304", name: "KB국민카드" },
  lotte: { code: "0303", name: "롯데카드" },
  hana: { code: "0313", name: "하나카드" },
  woori: { code: "0309", name: "우리카드" },
  bc: { code: "0305", name: "BC카드" },
  nh: { code: "0307", name: "NH농협카드" },
  citi: { code: "0312", name: "씨티카드" },
} as const;

export type CardCompanyKey = keyof typeof CARD_COMPANY_CODES;
