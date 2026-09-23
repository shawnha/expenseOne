// ---------------------------------------------------------------------------
// 세금계산서 발행 요청 — 순수 도우미 (DB·Next 없음, 단위 테스트 대상: tax-invoice.test.ts)
//
// 홀세일 등에서 약국·의원에 판 건의 **매출** 세금계산서를 발행해 달라고 요청하는 기능이다.
// 비용이 아니라서 expenses 와 따로 산다(drizzle/0026). 발행 법인은 ERP entities.code 로 적는다 —
// 홀세일(HOW)은 익스펜스원 companies 에 없다.
// ---------------------------------------------------------------------------

export const TAX_INVOICE_ISSUERS = [
  { code: "HOW", name: "한아원홀세일" },
  { code: "HOK", name: "한아원코리아" },
  { code: "HOR", name: "한아원리테일" },
  { code: "HOP", name: "한아원파트너스" },
] as const;

export type IssuerCode = (typeof TAX_INVOICE_ISSUERS)[number]["code"];
export const ISSUER_CODES = TAX_INVOICE_ISSUERS.map((i) => i.code) as [IssuerCode, ...IssuerCode[]];

export function issuerName(code: string): string {
  return TAX_INVOICE_ISSUERS.find((i) => i.code === code)?.name ?? code;
}

export const TAX_INVOICE_STATUSES = ["REQUESTED", "ISSUED", "CANCELLED"] as const;
export type TaxInvoiceStatus = (typeof TAX_INVOICE_STATUSES)[number];

export const TAX_INVOICE_STATUS_LABEL: Record<TaxInvoiceStatus, string> = {
  REQUESTED: "발행 대기",
  ISSUED: "발행 완료",
  CANCELLED: "취소",
};

/** 청구 = 돈을 아직 안 받음, 영수 = 이미 받음. 세금계산서 양식의 "이 금액을 (영수/청구)함". */
export const CHARGE_TYPES = ["CHARGE", "RECEIPT"] as const;
export type ChargeType = (typeof CHARGE_TYPES)[number];
export const CHARGE_TYPE_LABEL: Record<ChargeType, string> = { CHARGE: "청구", RECEIPT: "영수" };

// --- 사업자등록번호 -------------------------------------------------------------------

/** 숫자만 남긴다. "123-45-67890" → "1234567890". */
export function bizNoDigits(v: string): string {
  return v.replace(/\D/g, "");
}

/** 10자리면 "123-45-67890", 아니면 들어온 그대로. */
export function formatBizNo(v: string): string {
  const d = bizNoDigits(v);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : v;
}

/**
 * 사업자등록번호 검증번호(끝자리) 확인. 가중치 1·3·7·1·3·7·1·3·5, 9번째 자리×5의 십의 자리를 더한다.
 * 막지는 않고 화면이 "다시 확인하세요" 라고만 한다 — 틀린 번호로 계산서가 나가는 게 제일 비싸지만,
 * 검사식이 드물게 안 맞는 번호로 요청 자체를 막는 것도 곤란하다.
 */
export function isValidBizNoChecksum(v: string): boolean {
  const d = bizNoDigits(v);
  if (d.length !== 10) return false;
  const n = d.split("").map(Number);
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += n[i] * w[i];
  sum += Math.floor((n[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === n[9];
}

// --- SIMS 전표 → 품목 한 줄 ------------------------------------------------------------

/** 전표 줄들의 품목 이름 → 요청의 "품목" 칸. 두 줄까지 적고 나머지는 "외 N건". */
export function summarizeItems(names: readonly string[], max = 2): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length <= max) return clean.join(", ");
  return `${clean.slice(0, max).join(", ")} 외 ${clean.length - max}건`;
}

// --- 홈택스 발행 기록 대조 --------------------------------------------------------------

export interface HometaxInvoiceRef {
  issueDate: string; // YYYY-MM-DD
  total: number;
  bizNo: string; // 숫자 10자리
  issuerCode: string;
}

/** ERP 가 모은 홈택스 매출 계산서 중 이 요청과 같은 것으로 볼 만한 것. 공급일 7일 전부터. */
export function findHometaxMatch(
  request: { issuerCode: string; bizNo: string; total: number; supplyDate: string },
  invoices: readonly HometaxInvoiceRef[],
): HometaxInvoiceRef | null {
  const from = shiftDays(request.supplyDate, -7);
  const hits = invoices.filter(
    (inv) =>
      inv.issuerCode === request.issuerCode &&
      inv.bizNo === bizNoDigits(request.bizNo) &&
      inv.total === request.total &&
      inv.issueDate >= from,
  );
  if (hits.length === 0) return null;
  // 공급일에 가장 가까운 것
  return [...hits].sort((a, b) => (a.issueDate < b.issueDate ? -1 : 1))[0];
}

function shiftDays(date: string, days: number): string {
  const t = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 세금계산서 발행 기한: 공급일이 속한 달의 **다음 달 10일**. */
export function issueDeadline(supplyDate: string): string {
  const y = +supplyDate.slice(0, 4);
  const m = +supplyDate.slice(5, 7);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-10`;
}
