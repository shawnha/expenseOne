// ---------------------------------------------------------------------------
// 입금요청 미리 채우기 + 제출 전 요약 — 무엇을 언제 채우는지와 요약의 숫자는 **여기 한 곳**에서 정한다.
//
// 2026-10-26 오너 결정: 「금액 등도 일단은 채워지고, 고칠지 확인하도록 주변을 띠로 하이라이트하고,
// 제출 전에 전체 요약을 보여 주면서 한 번 더 확인」. 그래서 **이번 건을 설명하는 출처**는 채운다.
//   - 비용계획(plan): 제목·회사·납기일(예전부터) + 금액(원화 계획만) + 거래처와 같은 예금주의 지난 계좌
//   - 첨부 서류(ocr): 금액·계좌 — 칸이 비어 있을 때만
//   - 반복 지급(recurring): 회차 값(예전부터)
// **지난 건(payee)의 금액은 여전히 채우지 않는다.** 지난달 금액이 그대로 제출된 사고가 그 경로였다
// (autofill.service 머리 주석). 지난 건에서 오는 건 계좌·카테고리·회사뿐이다.
//
// 우선순위: 사람이 친 값 > 먼저 채운 자동값. 나중에 다른 값이 나오면 덮지 않고 「적용」 칩으로 남긴다
// (칩은 값이 같으면 숨으므로 서로 덮어쓰는 고리가 생기지 않는다).
// 채운 칸은 띠로 표시하고(FillRecords), 사람이 그 칸을 고쳐 값이 달라지면 띠가 저절로 빠진다.
// ---------------------------------------------------------------------------
import { calcDepositBreakdownKRW } from "@/lib/utils/deposit-amount";
import { prePaidSplit } from "@/lib/utils/pre-paid";
import { accountKey, holderKey } from "@/lib/utils/autofill";

export type FillSource = "plan" | "payee" | "ocr" | "recurring";
export type FillField = "title" | "company" | "dueDate" | "amount" | "account" | "category";
/** 지금 띠를 보여 줄 칸과 그 출처. */
export type AutoFilled = Partial<Record<FillField, FillSource>>;

/** 띠·요약 배지 문구. 「…에서 채움」 */
export const FILL_SOURCE_LABEL: Record<FillSource, string> = {
  plan: "비용계획에서 채움",
  payee: "지난 계좌에서 채움",
  ocr: "첨부 서류에서 채움",
  recurring: "반복 지급에서 채움",
};

/**
 * 채운 순간의 값을 기억해 둔다. 띠는 **지금 값이 그때 값과 같을 때만** 보인다 — 사람이 고치면 값이 달라져
 * 띠가 저절로 빠지므로 칸마다 onChange 를 따로 엮지 않는다. 값 비교는 아래 fillKey 로만 한다.
 */
export type FillRecords = Partial<Record<FillField, { source: FillSource; key: string }>>;

const ymdKey = (d: Date | null | undefined) =>
  d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";

/** 칸별 비교 키. 공백·하이픈 차이는 같은 값으로 본다. */
export const fillKey = {
  title: (t: string | null | undefined) => (t ?? "").trim(),
  company: (id: string | null | undefined) => id ?? "",
  dueDate: ymdKey,
  /** 금액 칸에 친 값(KRW 원 / USD 달러)과 통화. 부가세 방식은 사람이 고르는 것이라 키에 넣지 않는다. */
  amount: (supply: number, currency: string) => (supply > 0 ? `${currency}:${supply}` : ""),
  account: (bank: string | null | undefined, holder: string | null | undefined, num: string | null | undefined) =>
    accountKey(num) ? `${(bank ?? "").trim()}|${holderKey(holder)}|${accountKey(num)}` : "",
  category: (c: string | null | undefined) => (c ?? "").trim(),
};

/** 채운 칸을 기록한다. 빈 값(key "")은 기록하지 않는다. */
export function recordFill(rec: FillRecords, field: FillField, source: FillSource, key: string): FillRecords {
  if (!key) return rec;
  return { ...rec, [field]: { source, key } };
}

/** 지금 값(칸별 키)과 비교해 띠를 보여 줄 칸만 남긴다. */
export function activeFills(rec: FillRecords, current: Record<FillField, string>): AutoFilled {
  const out: AutoFilled = {};
  for (const f of Object.keys(rec) as FillField[]) {
    const r = rec[f];
    if (r && r.key === current[f]) out[f] = r.source;
  }
  return out;
}

interface AccountFields {
  bankName: string | null | undefined;
  accountHolder: string | null | undefined;
  accountNumber: string | null | undefined;
}

/** 은행·예금주·계좌번호가 모두 비었는가. 하나라도 사람이 쳤으면 자동으로 덮지 않는다. */
export function accountFieldsEmpty(c: AccountFields): boolean {
  return !c.bankName?.trim() && !c.accountHolder?.trim() && !accountKey(c.accountNumber);
}

/**
 * 계획 금액을 금액 칸에 넣을지. 넣을 **입력 금액(원)** 또는 null.
 * - 원화 계획 + 폼도 원화일 때만(2026-10-26 운영 계획은 전부 KRW지만 칸이 있다).
 * - 금액 칸이 비어 있고 아직 손대지 않았을 때만 — 반복 회차·사진·사람이 넣은 값을 덮지 않는다.
 * - 계획 금액은 지급 총액으로 본다: 폼은 「부가세 포함」(입력 금액 = 최종 금액)으로 넣는다.
 */
export function planAmountToFill(
  plan: { amount: number; currency?: string | null },
  form: { supplyAmount: number; amountTouched: boolean; currency: string },
): number | null {
  if ((plan.currency ?? "KRW") !== "KRW" || form.currency !== "KRW") return null;
  if (!Number.isSafeInteger(plan.amount) || plan.amount <= 0) return null;
  if (form.supplyAmount !== 0 || form.amountTouched) return null;
  return plan.amount;
}

/**
 * 계획 거래처와 같은 예금주로 **내가** 보낸 적 있는 계좌(가장 최근 것). 계좌 칸이 비어 있을 때만.
 * myPayees 는 본인 기록·반려/취소 제외·최근 순이다(autofill.service).
 */
export function payeeForVendor<P extends { accountHolder: string }>(
  vendorName: string | null | undefined,
  payees: readonly P[],
  current: AccountFields,
): P | null {
  const key = holderKey(vendorName);
  if (!key || !accountFieldsEmpty(current)) return null;
  return payees.find((p) => holderKey(p.accountHolder) === key) ?? null;
}

/** 사진에서 읽은 원화 금액을 바로 넣을지 — 원화 폼, 금액 칸이 비어 있고 손대지 않았을 때만. */
export function shouldAutoFillOcrAmount(form: { supplyAmount: number; amountTouched: boolean; currency: string }): boolean {
  return form.currency === "KRW" && form.supplyAmount === 0 && !form.amountTouched;
}

/**
 * 달러 문서의 금액(달러, 소수 둘째 자리까지). 폼이 받는 외화는 USD 뿐이라 다른 통화(CNY·CAD 등)는 null —
 * 화면은 지금처럼 「직접 환산해 입력」 안내를 둔다. 셋째 자리 이하가 있으면 잘못 읽은 값으로 보고 넣지 않는다.
 */
export function ocrUsdAmount(f: { currency?: string | null; totalAmount?: number | null }): number | null {
  if ((f.currency ?? "").trim().toUpperCase() !== "USD") return null;
  const t = f.totalAmount;
  if (t == null || !Number.isFinite(t) || t <= 0) return null;
  const cents = Math.round(t * 100);
  if (Math.abs(t * 100 - cents) > 1e-6 || !Number.isSafeInteger(cents)) return null;
  return cents / 100;
}

/**
 * 달러 금액을 바로 넣을지 — 금액 칸이 비어 있고 손대지 않았을 때만(폼이 원화여도 된다: 호출부가 달러로
 * 바꾼 뒤 넣는다. 통화를 바꾸면 금액 칸이 비워지므로 채운 값이 있을 때 바꾸면 안 된다).
 */
export function shouldAutoFillOcrUsdAmount(form: { supplyAmount: number; amountTouched: boolean }): boolean {
  return form.supplyAmount === 0 && !form.amountTouched;
}

/** 사진에서 읽은 계좌를 바로 넣을지 — 세 칸이 모두 비었을 때만. */
export function shouldAutoFillOcrAccount(current: AccountFields): boolean {
  return accountFieldsEmpty(current);
}

// ---------------------------------------------------------------------------
// 제출 전 요약
// ---------------------------------------------------------------------------

export interface DepositSummaryInput {
  companyName: string | null;
  categoryLabel: string | null;
  title: string;
  /** "KRW" | "USD" */
  currency: string;
  /** 금액 칸에 친 값(KRW 원 / USD 달러). */
  supplyAmount: number;
  /** 「부가세 별도」 — 입력 금액에 10%를 더한다(폼의 vatIncluded 상태와 같은 뜻). */
  vatAdded: boolean;
  freelancer: boolean;
  /** USD 환율. 원화면 무시. */
  rate: number | null;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  dueDate: Date | null;
  isUrgent: boolean;
  isPrePaid: boolean;
  prePaidMode: "full" | "partial";
  prePaidUnit: "percent" | "amount";
  prePaidPercentage: number | null;
  prePaidFixedAmount: number | null;
  /** 연결될 계획. 회사가 달라 연결이 안 되면 linked=false. */
  plan: { title: string; linked: boolean } | null;
  attachments: { count: number; typeLabels: string[] };
  branch: string | null;
  /** 사입 약국 줄 수(사입이 아니면 0). */
  purchaseCount: number;
  description: string | null;
  autoFilled: AutoFilled;
}

export interface SummaryRow {
  key: "company" | "category" | "title" | "amount" | "prepay" | "account" | "dueDate" | "urgent" | "plan" | "attachments" | "branch" | "purchase" | "description";
  label: string;
  value: string;
  /** 금액 내역·주의 문구 등 둘째 줄들. */
  details: string[];
  /** 자동으로 채운 칸이면 출처 — 요약에서 배지로 보여 준다. */
  source: FillSource | null;
  /** 연결 안 됨처럼 다시 볼 것. */
  warning: boolean;
}

export interface DepositSummary {
  rows: SummaryRow[];
  /** 저장될 원화 실지급액. USD 인데 환율이 없으면 null. */
  finalKRW: number | null;
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ymd = (d: Date) =>
  `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;

/**
 * 요약 행. 금액은 폼의 화면 내역·선지급 미리보기와 **같은 함수**(calcDepositBreakdownKRW·prePaidSplit)로
 * 계산한다 — 요약에 보인 숫자가 저장될 숫자다(서버 순서: 최소 단위 → 부가세 → 원천징수 → 환산).
 */
export function buildDepositSummary(i: DepositSummaryInput): DepositSummary {
  const src = (f: FillField) => i.autoFilled[f] ?? null;
  const row = (r: Omit<SummaryRow, "details" | "source" | "warning"> & Partial<SummaryRow>): SummaryRow => ({
    details: [],
    source: null,
    warning: false,
    ...r,
  });
  const rows: SummaryRow[] = [];

  rows.push(row({ key: "company", label: "회사", value: i.companyName ?? "-", source: src("company") }));
  rows.push(row({ key: "category", label: "카테고리", value: i.categoryLabel?.trim() || "-", source: src("category") }));
  rows.push(row({ key: "title", label: "제목", value: i.title.trim() || "-", source: src("title") }));

  const bd = calcDepositBreakdownKRW(i.supplyAmount, i.currency, i.vatAdded, i.freelancer, i.rate);
  const isUSD = i.currency === "USD";
  if (!bd) {
    rows.push(
      row({
        key: "amount",
        label: "금액",
        value: isUSD ? usd(i.supplyAmount) : won(i.supplyAmount),
        details: ["환율을 불러오지 못해 원화 금액을 계산할 수 없습니다."],
        source: src("amount"),
        warning: true,
      }),
    );
  } else {
    const details: string[] = [];
    if (isUSD) details.push(`입력 ${usd(i.supplyAmount)} · 환율 ${i.rate!.toLocaleString("ko-KR")}원`);
    if (i.vatAdded) details.push(`공급가 ${won(bd.baseKRW)} + 부가세 ${won(bd.vatKRW)}`);
    if (i.freelancer) {
      details.push(`원천징수 3.3% −${won(bd.withholdingKRW)} (공제 전 ${won(bd.totalBeforeWithholdingKRW)})`);
    }
    rows.push(
      row({
        key: "amount",
        label: i.freelancer ? "지급액 (3.3% 공제 후)" : "금액",
        value: isUSD ? `약 ${won(bd.finalKRW)}` : won(bd.finalKRW),
        details,
        source: src("amount"),
      }),
    );
  }

  if (i.isPrePaid) {
    if (i.prePaidMode === "full") {
      rows.push(row({ key: "prepay", label: "선지급", value: "전액 선지급" }));
    } else if (bd) {
      const split = prePaidSplit({
        amount: bd.finalKRW,
        isPrePaid: true,
        prePaidPercentage: i.prePaidUnit === "amount" ? 1 : (i.prePaidPercentage ?? 50),
        prePaidFixedAmount: i.prePaidUnit === "amount" ? i.prePaidFixedAmount : null,
      });
      if (split && !(i.prePaidUnit === "amount" && !split.byAmount)) {
        rows.push(
          row({
            key: "prepay",
            label: "선지급",
            value: `선지급 ${won(split.prePaidAmount)}${split.percentage != null ? ` (${split.percentage}%)` : ""}`,
            details: [`후지급 ${won(split.remainingAmount)}`],
          }),
        );
      } else {
        rows.push(row({ key: "prepay", label: "선지급", value: "부분 선지급 금액을 확인해주세요", warning: true }));
      }
    } else {
      rows.push(row({ key: "prepay", label: "선지급", value: "부분 선지급", details: ["원화 금액을 계산할 수 없어 나누지 못했습니다."], warning: true }));
    }
  }

  const acct = [i.bankName.trim(), i.accountNumber.trim()].filter(Boolean).join(" ");
  rows.push(
    row({
      key: "account",
      label: "받는 계좌",
      value: acct ? `${acct} · ${i.accountHolder.trim() || "-"}` : "-",
      source: src("account"),
    }),
  );
  rows.push(row({ key: "dueDate", label: "납기일", value: i.dueDate ? ymd(i.dueDate) : "지정 안 함", source: src("dueDate") }));
  if (i.isUrgent) rows.push(row({ key: "urgent", label: "긴급", value: "긴급 처리 요청" }));
  if (i.branch) rows.push(row({ key: "branch", label: "호점", value: i.branch }));
  if (i.purchaseCount > 0) rows.push(row({ key: "purchase", label: "사입", value: `약국 ${i.purchaseCount}곳` }));
  if (i.plan) {
    rows.push(
      row({
        key: "plan",
        label: "비용계획",
        value: i.plan.linked ? `「${i.plan.title}」에 연결` : `「${i.plan.title}」 연결 안 됨`,
        details: i.plan.linked ? [] : ["계획의 회사와 달라 연결되지 않습니다."],
        warning: !i.plan.linked,
      }),
    );
  }
  rows.push(
    row({
      key: "attachments",
      label: "첨부",
      value: `${i.attachments.count}개`,
      details: i.attachments.typeLabels.length ? [i.attachments.typeLabels.join(", ")] : [],
    }),
  );
  if (i.description?.trim()) rows.push(row({ key: "description", label: "메모", value: i.description.trim() }));

  return { rows, finalKRW: bd ? bd.finalKRW : null };
}
