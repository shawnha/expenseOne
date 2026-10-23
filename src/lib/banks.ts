/**
 * 입금요청 은행 선택지와, 사진(OCR)에서 읽은 은행 이름을 이 목록의 이름으로 맞추는 함수.
 * 은행 칸은 zod에서 자유 문자열이라 목록에 없는 표기가 들어가도 통과한다 — 그러면 선택 표시가 안 뜬다.
 */

export const BANK_LIST = [
  // 시중은행
  "KB국민은행",
  "신한은행",
  "하나은행",
  "우리은행",
  "SC제일은행",
  "한국씨티은행",
  // 지방은행
  "IBK기업은행",
  "NH농협은행",
  "Sh수협은행",
  "대구은행",
  "부산은행",
  "광주은행",
  "전북은행",
  "경남은행",
  "제주은행",
  // 인터넷은행
  "카카오뱅크",
  "케이뱅크",
  "토스뱅크",
  // 특수은행
  "KDB산업은행",
  "한국수출입은행",
  "새마을금고",
  "신협",
  "우체국",
  "저축은행",
] as const;

export type BankName = (typeof BANK_LIST)[number];

// 띄어쓰기·괄호·"은행"·"(주)" 등을 뺀 비교용 열쇠 → 목록 이름
const ALIASES: Array<[string, BankName]> = [
  ["kb국민", "KB국민은행"], ["국민", "KB국민은행"], ["kb", "KB국민은행"], ["kookmin", "KB국민은행"],
  ["신한", "신한은행"], ["shinhan", "신한은행"],
  ["하나", "하나은행"], ["keb하나", "하나은행"], ["외환", "하나은행"], ["hana", "하나은행"],
  ["우리", "우리은행"], ["woori", "우리은행"],
  ["sc제일", "SC제일은행"], ["제일", "SC제일은행"], ["sc", "SC제일은행"], ["standardchartered", "SC제일은행"],
  ["한국씨티", "한국씨티은행"], ["씨티", "한국씨티은행"], ["citi", "한국씨티은행"], ["citibank", "한국씨티은행"],
  ["ibk기업", "IBK기업은행"], ["기업", "IBK기업은행"], ["ibk", "IBK기업은행"],
  ["nh농협", "NH농협은행"], ["농협", "NH농협은행"], ["nh", "NH농협은행"], ["단위농협", "NH농협은행"], ["지역농협", "NH농협은행"],
  ["sh수협", "Sh수협은행"], ["수협", "Sh수협은행"],
  ["대구", "대구은행"], ["im뱅크", "대구은행"], ["imbank", "대구은행"], ["dgb대구", "대구은행"],
  ["부산", "부산은행"], ["bnk부산", "부산은행"],
  ["광주", "광주은행"],
  ["전북", "전북은행"],
  ["경남", "경남은행"], ["bnk경남", "경남은행"],
  ["제주", "제주은행"],
  ["카카오뱅크", "카카오뱅크"], ["카카오", "카카오뱅크"], ["kakaobank", "카카오뱅크"],
  ["케이뱅크", "케이뱅크"], ["kbank", "케이뱅크"],
  ["토스뱅크", "토스뱅크"], ["토스", "토스뱅크"], ["tossbank", "토스뱅크"],
  ["kdb산업", "KDB산업은행"], ["산업", "KDB산업은행"], ["kdb", "KDB산업은행"],
  ["한국수출입", "한국수출입은행"], ["수출입", "한국수출입은행"],
  ["새마을금고", "새마을금고"], ["새마을", "새마을금고"], ["mg새마을금고", "새마을금고"],
  ["신협", "신협"], ["신용협동조합", "신협"],
  ["우체국", "우체국"], ["우정사업본부", "우체국"],
  ["저축은행", "저축은행"], ["저축", "저축은행"],
];

function bankKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(주\)|㈜|주식회사/g, "")
    .replace(/[\s()·.,\-_]/g, "")
    .replace(/은행$|bank$/g, "");
}

const KEY_TO_BANK = new Map<string, BankName>();
for (const b of BANK_LIST) KEY_TO_BANK.set(bankKey(b), b);
for (const [k, b] of ALIASES) if (!KEY_TO_BANK.has(k)) KEY_TO_BANK.set(k, b);

/**
 * 읽은 은행 이름을 목록 이름으로. 못 맞추면 null — 그럴 땐 칸을 채우지 않는다.
 * "OO저축은행"처럼 저축은행 이름이 붙어 오면 "저축은행"으로 본다.
 */
export function normalizeBankName(raw: string | null | undefined): BankName | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if ((BANK_LIST as readonly string[]).includes(trimmed)) return trimmed as BankName;
  if (/저축은행/.test(trimmed)) return "저축은행";
  if (/새마을금고/.test(trimmed)) return "새마을금고";
  return KEY_TO_BANK.get(bankKey(trimmed)) ?? null;
}
