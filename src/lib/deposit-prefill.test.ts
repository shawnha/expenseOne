import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accountFieldsEmpty,
  buildDepositSummary,
  formatPlanAmountReference,
  activeFills,
  dropFills,
  fillKey,
  planFillsToUndo,
  recordFill,
  ocrUsdAmount,
  payeeForVendor,
  planAmountToFill,
  decideOcrAmount,
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
    assert.equal(ocrUsdAmount({ currency: "USD", totalAmount: 100, amountIncludesVat: "no" }), null);
    assert.equal(ocrUsdAmount({ currency: "USD", totalAmount: 100, amountIncludesVat: "unknown" }), 100);
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
  it("계획 연결을 풀면 계획으로 채운(그대로인) 칸만 되돌린다", () => {
    let rec = recordFill({}, "amount", "plan", fillKey.amount(550000, "KRW"));
    rec = recordFill(rec, "title", "plan", fillKey.title("촬영"));
    rec = recordFill(rec, "account", "payee", fillKey.account("국민은행", "샘플", "12345678"), { viaPlan: true });
    rec = recordFill(rec, "category", "payee", fillKey.category("기타")); // 사람이 고른 지난 계좌 — 계획과 무관
    rec = recordFill(rec, "company", "ocr", fillKey.company("c1"));
    const cur = {
      title: "촬영 수정함", company: "c1", dueDate: "", amount: fillKey.amount(550000, "KRW"),
      account: fillKey.account("국민은행", "샘플", "12345678"), category: "기타",
    };
    assert.deepEqual(planFillsToUndo(rec, cur).sort(), ["account", "amount"]);
    assert.deepEqual(Object.keys(dropFills(rec, ["account", "amount"])).sort(), ["category", "company", "title"]);
    assert.equal(dropFills(rec, []), rec);
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


describe("서류 금액 결정", () => {
  const current = { title: "", company: "", dueDate: "", amount: "KRW:1000000", account: "", category: "" };
  const input = {
    fills: recordFill({}, "amount", "plan", current.amount), current,
    supplyAmount: 1000000, amountTouched: false, currency: "KRW", amount: 1000000, planFinal: 1000000,
    ocrAmount: { base: 1200000, vatExclusive: true, currency: "KRW" as string | null }, ocrUsd: null,
    freelancer: false, recurring: false, done: false, pendingSubmit: false, isSubmitting: false,
  };
  it("그대로인 계획만 교체하고 서류 출처는 계획 해제에도 남는다", () => {
    assert.equal(decideOcrAmount(input), "replacePlan");
    const rec = recordFill(input.fills, "amount", "ocr", "KRW:1200000");
    assert.deepEqual(planFillsToUndo(rec, { ...current, amount: "KRW:1200000" }), []);
    for (const source of ["payee", "recurring", "ocr"] as const) {
      assert.equal(decideOcrAmount({ ...input, fills: recordFill({}, "amount", source, current.amount) }), "none");
    }
    assert.equal(decideOcrAmount({ ...input, fills: {} }), "none");
  });
  it("수동 편집·키 불일치·외화·서류 없음·요약·제출·처리 완료·반복은 교체하지 않는다", () => {
    for (const patch of [
      { amountTouched: true }, { current: { ...current, amount: "KRW:999999" } },
      { currency: "USD" }, { ocrAmount: null }, { pendingSubmit: true }, { isSubmitting: true },
      { amount: 0 }, { done: true }, { recurring: true }, { planFinal: null },
    ]) assert.equal(decideOcrAmount({ ...input, ...patch }), "none");
    // VAT 별도로 바꾼 뒤 원래 계획과 같은 서류가 와도 사람의 변경을 지킨다.
    assert.equal(decideOcrAmount({ ...input, amount: 1100000, amountTouched: true,
      fills: dropFills(input.fills, ["amount"]), ocrAmount: { base: 1000000, vatExclusive: false, currency: "KRW" } }), "none");
  });
  it("통화 불명은 계획 교체를 막되 빈 칸은 기존대로 채운다", () => {
    for (const currency of [null, "unknown"]) {
      const ocrAmount = { ...input.ocrAmount, currency };
      assert.equal(decideOcrAmount({ ...input, ocrAmount }), "none");
      assert.equal(decideOcrAmount({ ...input, ocrAmount, supplyAmount: 0, amount: 0 }), "fillEmpty");
    }
  });
  it("같은 최종액이면 원천징수·VAT 조합과 관계없이 done만 기록한다", () => {
    for (const freelancer of [false, true]) {
      for (const vatExclusive of [false, true]) {
        const ocrAmount = { base: 1000000, vatExclusive, currency: "KRW" };
        const amount = calcDepositAmount(ocrAmount.base, "KRW", vatExclusive, freelancer);
        const planFinal = calcDepositAmount(1000000, "KRW", false, freelancer);
        assert.equal(decideOcrAmount({ ...input, amount, planFinal, ocrAmount, freelancer }), "markDone");
      }
    }
  });
  it("배율은 현재값이 아닌 계획 최종액 기준이고 0.5·2는 거절한다", () => {
    for (const base of [1, 499999, 500000, 2000000, 12000000, NaN, Infinity]) {
      assert.equal(decideOcrAmount({ ...input, ocrAmount: { base, vatExclusive: false, currency: "KRW" } }), "none");
    }
    for (const base of [500001, 999999, 1000001, 1999999]) {
      assert.equal(decideOcrAmount({ ...input, ocrAmount: { base, vatExclusive: false, currency: "KRW" } }), "replacePlan");
    }
    assert.equal(decideOcrAmount({ ...input, amount: 1500000,
      ocrAmount: { base: 2000000, vatExclusive: false, currency: "KRW" } }), "none");
  });
  it("빈 원화·달러 칸은 채우되 수동 편집·요약·제출 중에는 비어도 고정한다", () => {
    const empty = { ...input, supplyAmount: 0, amount: 0, fills: {} };
    assert.equal(decideOcrAmount(empty), "fillEmpty");
    assert.equal(decideOcrAmount({ ...empty, recurring: true }), "fillEmpty");
    const usd = { ...empty, ocrAmount: null, ocrUsd: 123.45 };
    assert.equal(decideOcrAmount(usd), "fillUsd");
    assert.equal(decideOcrAmount({ ...usd, supplyAmount: 1 }), "none");
    for (const patch of [{ amountTouched: true }, { pendingSubmit: true }, { isSubmitting: true }, { done: true }]) {
      assert.equal(decideOcrAmount({ ...empty, ...patch }), "none");
      assert.equal(decideOcrAmount({ ...usd, ...patch }), "none");
    }
  });
});

describe("formatPlanAmountReference", () => {
  it("차이 안내·크게 다름 안내는 계획 원액과 공제 후 금액을 구분한다", () => {
    assert.equal(formatPlanAmountReference(1000000, true), "1,000,000원(3.3% 공제 후 967,000원)");
    assert.equal(formatPlanAmountReference(1000000, true, "공제 후"), "1,000,000원(공제 후 967,000원)");
    assert.equal(formatPlanAmountReference(1000000, false), "1,000,000원");
  });
});

describe("요약 차이 경고", () => {
  it("연결된 원화 계획·반복 등록 금액과 최종액의 차이", () => {
    const plan = { title: "계획", linked: true, amount: 1000000 };
    const s = buildDepositSummary({ ...base, plan, supplyAmount: 1200000, vatAdded: true });
    assert.deepEqual(rowOf(s, "amount")?.details, ["공급가 1,200,000원 + 부가세 120,000원", "계획 금액 1,000,000원과 달라요 (+320,000원)"]);
    assert.equal(rowOf(s, "amount")?.warning, true);
    const recurring = buildDepositSummary({ ...base, plan: null, recurringAmount: 600000 });
    assert.deepEqual(rowOf(recurring, "amount")?.details, ["등록 금액 600,000원과 달라요 (−50,000원)"]);
    for (const plan of [{ title: "계획", linked: false, amount: 1 }, { title: "달러", linked: true, amount: 1, currency: "USD" }, { title: "같음", linked: true, amount: 550000 }]) {
      assert.equal(rowOf(buildDepositSummary({ ...base, plan }), "amount")?.warning, false);
    }
  });
  it("원천징수 계획은 채운 기준으로 비교하고 반복은 등록 지급액 그대로 비교한다", () => {
    const plan = { title: "계획", linked: true, amount: 1000000 };
    const same = buildDepositSummary({ ...base, plan, supplyAmount: 1000000, freelancer: true });
    assert.equal(same.finalKRW, 967000);
    assert.equal(rowOf(same, "amount")?.warning, false);
    assert.equal(rowOf(same, "amount")?.details.some((d) => d.includes("달라요")), false);
    const diff = buildDepositSummary({ ...base, plan, supplyAmount: 1200000, freelancer: true });
    assert.ok(rowOf(diff, "amount")?.details.includes("계획 금액 1,000,000원(공제 후 967,000원)과 달라요 (+193,400원)"));
    const recurring = buildDepositSummary({ ...base, plan: null, supplyAmount: 1000000, freelancer: true, recurringAmount: 967000 });
    assert.equal(rowOf(recurring, "amount")?.warning, false);
  });
  it("남은 서류 금액·계좌는 서로 다를 때만 경고", () => {
    const i = { ...base, remainingOcrAmount: 1320000, remainingOcrAccount: { bankName: "국민은행", accountNumber: "12345675678", accountHolder: "홍길동" } };
    const s = buildDepositSummary(i);
    assert.deepEqual(rowOf(s, "amount")?.details, ["첨부 서류: 1,320,000원 — 지금 값과 달라요"]);
    assert.equal(rowOf(s, "amount")?.warning, true);
    assert.deepEqual(rowOf(s, "account")?.details, ["첨부 서류 계좌(국민은행 …5678)와 달라요"]);
    assert.equal(rowOf(s, "account")?.warning, true);
    const same = buildDepositSummary({ ...base, remainingOcrAmount: 550000, remainingOcrAccount: { bankName: null, accountNumber: "123-45678901", accountHolder: " 샘플스튜디오 " } });
    assert.equal(rowOf(same, "account")?.warning, false);
    assert.equal(rowOf(same, "amount")?.warning, false);
  });
});
