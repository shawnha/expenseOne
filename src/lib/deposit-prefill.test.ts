import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accountFieldsEmpty,
  buildDepositSummary,
  activeFills,
  fillKey,
  recordFill,
  ocrUsdAmount,
  payeeForVendor,
  planAmountToFill,
  shouldAutoFillOcrAccount,
  shouldAutoFillOcrAmount,
  shouldAutoFillOcrUsdAmount,
  type DepositSummaryInput,
} from "./deposit-prefill";
import { calcDepositAmount } from "./utils/deposit-amount";

const emptyAcct = { bankName: "", accountHolder: "", accountNumber: "" };
const blankForm = { supplyAmount: 0, amountTouched: false, currency: "KRW" };

describe("planAmountToFill", () => {
  it("원화 계획 + 빈 금액 칸이면 계획 금액", () => {
    assert.equal(planAmountToFill({ amount: 550000, currency: "KRW" }, blankForm), 550000);
    assert.equal(planAmountToFill({ amount: 550000 }, blankForm), 550000);
  });
  it("이미 값이 있거나 손댔으면 덮지 않는다(반복 회차·사진·사람)", () => {
    assert.equal(planAmountToFill({ amount: 550000 }, { ...blankForm, supplyAmount: 300000 }), null);
    assert.equal(planAmountToFill({ amount: 550000 }, { ...blankForm, amountTouched: true }), null);
  });
  it("외화 계획·외화 폼·이상한 금액은 넣지 않는다", () => {
    assert.equal(planAmountToFill({ amount: 1000, currency: "USD" }, blankForm), null);
    assert.equal(planAmountToFill({ amount: 1000 }, { ...blankForm, currency: "USD" }), null);
    for (const amount of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(planAmountToFill({ amount }, blankForm), null);
    }
  });
});

describe("payeeForVendor", () => {
  const payees = [
    { accountHolder: "샘플스튜디오", bankName: "국민은행", accountNumber: "111" },
    { accountHolder: " 샘플스튜디오 ", bankName: "신한은행", accountNumber: "222" },
  ];
  it("거래처 이름과 같은 예금주의 가장 최근 계좌", () => {
    assert.equal(payeeForVendor(" 샘플스튜디오", payees, emptyAcct)?.accountNumber, "111");
  });
  it("계좌 칸에 하나라도 있으면·거래처가 없으면·못 찾으면 null", () => {
    assert.equal(payeeForVendor("샘플스튜디오", payees, { ...emptyAcct, accountHolder: "홍길동" }), null);
    assert.equal(payeeForVendor("샘플스튜디오", payees, { ...emptyAcct, accountNumber: "1-2" }), null);
    assert.equal(payeeForVendor(null, payees, emptyAcct), null);
    assert.equal(payeeForVendor("  ", payees, emptyAcct), null);
    assert.equal(payeeForVendor("다른곳", payees, emptyAcct), null);
  });
});

describe("사진 자동 채우기 조건", () => {
  it("원화 금액: 원화 폼·빈 칸·손대지 않음일 때만", () => {
    assert.equal(shouldAutoFillOcrAmount(blankForm), true);
    assert.equal(shouldAutoFillOcrAmount({ ...blankForm, supplyAmount: 1 }), false);
    assert.equal(shouldAutoFillOcrAmount({ ...blankForm, amountTouched: true }), false);
    assert.equal(shouldAutoFillOcrAmount({ ...blankForm, currency: "USD" }), false);
  });
  it("계좌: 세 칸 모두 비었을 때만(하이픈·공백만 있으면 빈 것)", () => {
    assert.equal(shouldAutoFillOcrAccount(emptyAcct), true);
    assert.equal(shouldAutoFillOcrAccount({ bankName: " ", accountHolder: "", accountNumber: "--" }), true);
    assert.equal(shouldAutoFillOcrAccount({ ...emptyAcct, bankName: "국민은행" }), false);
    assert.equal(accountFieldsEmpty({ bankName: null, accountHolder: undefined, accountNumber: null }), true);
  });
  it("달러 금액: USD 문서만, 소수 둘째 자리까지", () => {
    assert.equal(ocrUsdAmount({ currency: "usd", totalAmount: 123.45 }), 123.45);
    assert.equal(ocrUsdAmount({ currency: "USD", totalAmount: 1200 }), 1200);
    assert.equal(ocrUsdAmount({ currency: "USD", totalAmount: 1.005 }), null);
    for (const f of [
      { currency: "KRW", totalAmount: 1000 },
      { currency: "CNY", totalAmount: 100 },
      { currency: "CAD", totalAmount: 100 },
      { currency: null, totalAmount: 100 },
      { currency: "USD", totalAmount: 0 },
      { currency: "USD", totalAmount: null },
    ]) {
      assert.equal(ocrUsdAmount(f), null, JSON.stringify(f));
    }
    assert.equal(shouldAutoFillOcrUsdAmount({ supplyAmount: 0, amountTouched: false }), true);
    assert.equal(shouldAutoFillOcrUsdAmount({ supplyAmount: 5, amountTouched: false }), false);
    assert.equal(shouldAutoFillOcrUsdAmount({ supplyAmount: 0, amountTouched: true }), false);
  });
});

describe("띠 표시 상태", () => {
  const cur = (o: Partial<Record<"title" | "company" | "dueDate" | "amount" | "account" | "category", string>>) => ({
    title: "", company: "", dueDate: "", amount: "", account: "", category: "", ...o,
  });
  it("채운 값 그대로면 띠, 사람이 고치면 저절로 빠진다", () => {
    let rec = recordFill({}, "title", "plan", fillKey.title(" 촬영 "));
    rec = recordFill(rec, "amount", "plan", fillKey.amount(550000, "KRW"));
    rec = recordFill(rec, "account", "ocr", fillKey.account("국민은행", "샘플", "123-456-78"));
    const same = cur({ title: "촬영", amount: "KRW:550000", account: fillKey.account("국민은행", " 샘플 ", "12345678") });
    assert.deepEqual(activeFills(rec, same), { title: "plan", amount: "plan", account: "ocr" });
    assert.deepEqual(activeFills(rec, { ...same, amount: fillKey.amount(500000, "KRW") }), { title: "plan", account: "ocr" });
    assert.deepEqual(activeFills(rec, { ...same, account: fillKey.account("신한은행", "샘플", "12345678") }), { title: "plan", amount: "plan" });
  });
  it("빈 값은 기록하지 않는다(나중에 비운 칸에 띠가 남지 않게)", () => {
    assert.deepEqual(recordFill({}, "amount", "plan", fillKey.amount(0, "KRW")), {});
    assert.deepEqual(recordFill({}, "account", "ocr", fillKey.account("", "", "--")), {});
    assert.equal(fillKey.dueDate(new Date(2026, 0, 5)), "2026-01-05");
    assert.equal(fillKey.dueDate(null), "");
  });
});

const base: DepositSummaryInput = {
  companyName: "한아원코리아",
  categoryLabel: "기타",
  title: "촬영 스튜디오 대관",
  currency: "KRW",
  supplyAmount: 550000,
  vatAdded: false,
  freelancer: false,
  rate: null,
  bankName: "국민은행",
  accountHolder: "샘플스튜디오",
  accountNumber: "12345678901",
  dueDate: new Date(2026, 9, 30),
  isUrgent: false,
  isPrePaid: false,
  prePaidMode: "full",
  prePaidUnit: "percent",
  prePaidPercentage: null,
  prePaidFixedAmount: null,
  plan: { title: "촬영 스튜디오 대관", linked: true },
  attachments: { count: 1, typeLabels: ["견적서"] },
  branch: null,
  purchaseCount: 0,
  description: null,
  autoFilled: { title: "plan", amount: "plan", account: "payee" },
};
const rowOf = (s: ReturnType<typeof buildDepositSummary>, key: string) => s.rows.find((r) => r.key === key);

describe("buildDepositSummary", () => {
  it("요약 금액 = 제출되는 amount (원화, 부가세·원천징수 조합 전부)", () => {
    for (const vatAdded of [false, true]) {
      for (const freelancer of [false, true]) {
        for (const supply of [1, 9, 550000, 1234567, 99999999]) {
          const s = buildDepositSummary({ ...base, supplyAmount: supply, vatAdded, freelancer });
          assert.equal(s.finalKRW, calcDepositAmount(supply, "KRW", vatAdded, freelancer));
        }
      }
    }
  });
  it("행 순서·값·출처 배지", () => {
    const s = buildDepositSummary(base);
    assert.deepEqual(
      s.rows.map((r) => r.key),
      ["company", "category", "title", "amount", "account", "dueDate", "plan", "attachments"],
    );
    assert.equal(rowOf(s, "amount")?.value, "550,000원");
    assert.equal(rowOf(s, "amount")?.source, "plan");
    assert.equal(rowOf(s, "account")?.value, "국민은행 12345678901 · 샘플스튜디오");
    assert.equal(rowOf(s, "account")?.source, "payee");
    assert.equal(rowOf(s, "dueDate")?.value, "2026.10.30");
    assert.equal(rowOf(s, "company")?.source, null);
    assert.equal(rowOf(s, "plan")?.value, "「촬영 스튜디오 대관」에 연결");
  });
  it("부가세 별도·원천징수 내역", () => {
    const s = buildDepositSummary({ ...base, supplyAmount: 100000, vatAdded: true, freelancer: true });
    const amt = rowOf(s, "amount")!;
    assert.equal(amt.label, "지급액 (3.3% 공제 후)");
    assert.equal(amt.value, `${calcDepositAmount(100000, "KRW", true, true).toLocaleString("ko-KR")}원`);
    assert.deepEqual(amt.details, ["공급가 100,000원 + 부가세 10,000원", "원천징수 3.3% −3,630원 (공제 전 110,000원)"]);
  });
  it("달러: 환율이 있으면 원화 환산, 없으면 경고", () => {
    const s = buildDepositSummary({ ...base, currency: "USD", supplyAmount: 100.5, rate: 1400 });
    assert.equal(s.finalKRW, Math.round((calcDepositAmount(100.5, "USD", false, false) / 100) * 1400));
    assert.equal(rowOf(s, "amount")?.value, "약 140,700원");
    const noRate = buildDepositSummary({ ...base, currency: "USD", supplyAmount: 100.5, rate: null });
    assert.equal(noRate.finalKRW, null);
    assert.equal(rowOf(noRate, "amount")?.warning, true);
  });
  it("선지급: 전액 / 비율 / 금액 — 폼 미리보기와 같은 나누기", () => {
    assert.equal(rowOf(buildDepositSummary({ ...base, isPrePaid: true }), "prepay")?.value, "전액 선지급");
    const pct = buildDepositSummary({ ...base, isPrePaid: true, prePaidMode: "partial", prePaidPercentage: 30 });
    assert.equal(rowOf(pct, "prepay")?.value, "선지급 165,000원 (30%)");
    assert.deepEqual(rowOf(pct, "prepay")?.details, ["후지급 385,000원"]);
    const fixed = buildDepositSummary({
      ...base, isPrePaid: true, prePaidMode: "partial", prePaidUnit: "amount", prePaidFixedAmount: 200000,
    });
    assert.equal(rowOf(fixed, "prepay")?.value, "선지급 200,000원");
    assert.deepEqual(rowOf(fixed, "prepay")?.details, ["후지급 350,000원"]);
    const bad = buildDepositSummary({
      ...base, isPrePaid: true, prePaidMode: "partial", prePaidUnit: "amount", prePaidFixedAmount: 550000,
    });
    assert.equal(rowOf(bad, "prepay")?.warning, true);
  });
  it("계획 연결 안 됨·빈 값·선택 항목", () => {
    const s = buildDepositSummary({
      ...base,
      plan: { title: "다른 회사 계획", linked: false },
      bankName: "",
      accountNumber: "",
      accountHolder: "",
      dueDate: null,
      isUrgent: true,
      branch: "교대점",
      purchaseCount: 2,
      description: "  메모  ",
      attachments: { count: 0, typeLabels: [] },
    });
    assert.equal(rowOf(s, "plan")?.warning, true);
    assert.equal(rowOf(s, "account")?.value, "-");
    assert.equal(rowOf(s, "dueDate")?.value, "지정 안 함");
    assert.equal(rowOf(s, "urgent")?.value, "긴급 처리 요청");
    assert.equal(rowOf(s, "branch")?.value, "교대점");
    assert.equal(rowOf(s, "purchase")?.value, "약국 2곳");
    assert.equal(rowOf(s, "description")?.value, "메모");
    assert.equal(rowOf(s, "attachments")?.value, "0개");
  });
});
