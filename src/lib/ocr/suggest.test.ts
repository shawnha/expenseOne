/**
 * OCR 「적용」 제안 계산 단위 테스트. 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { OcrFields } from "./types";
import { cardAmountMismatch, suggestAccount, suggestAmountKRW, suggestAmountKRWWithCurrency } from "./suggest";
import { normalizeBankName } from "../banks";

const f = (over: Partial<OcrFields>): OcrFields => ({
  docType: "견적서",
  merchantName: null,
  totalAmount: null,
  amountIncludesVat: "unknown",
  supplyAmount: null,
  vatAmount: null,
  currency: "KRW",
  date: null,
  bankName: null,
  accountHolder: null,
  accountNumber: null,
  cardLast4: null,
  confidence: "high",
  note: "",
  ...over,
});

describe("suggestAmountKRW", () => {
  it("입금요청 후보는 통화를 보존하고 기존 호출부의 반환값은 그대로다", () => {
    for (const currency of ["KRW", "krw", null]) {
      const fields = f({ totalAmount: 1000000, currency });
      assert.deepEqual(suggestAmountKRWWithCurrency(fields), {
        base: 1000000, vatExclusive: false, total: 1000000, currency: currency?.toUpperCase() ?? null,
      });
      assert.deepEqual(suggestAmountKRW(fields), { base: 1000000, vatExclusive: false, total: 1000000 });
    }
    assert.equal(suggestAmountKRWWithCurrency(f({ totalAmount: 100, currency: "USD" })), null);
  });
  it("공급가+부가세가 폼 계산과 맞으면 공급가 + 부가세 별도", () => {
    assert.deepEqual(suggestAmountKRW(f({ supplyAmount: 473000, vatAmount: 47300, totalAmount: 520300 })), {
      base: 473000, vatExclusive: true, total: 520300,
    });
  });
  it("부가세 끝수가 폼 반올림과 다르면 합계 + 부가세 포함 (돈이 어긋나지 않게)", () => {
    // 54,545 × 1.1 = 59,999.5 → 60,000 이지만 문서 부가세는 5,454 → 합계 59,999
    assert.deepEqual(suggestAmountKRW(f({ supplyAmount: 54545, vatAmount: 5454, totalAmount: 59999 })), {
      base: 59999, vatExclusive: false, total: 59999,
    });
  });
  it("합계 없이 공급가·부가세만 있고 끝수가 다르면 둘을 더한 합계 + 부가세 포함", () => {
    assert.deepEqual(suggestAmountKRW(f({ supplyAmount: 12345, vatAmount: 1234 })), {
      base: 13579, vatExclusive: false, total: 13579,
    });
  });
  it("VAT 별도 금액만 있는 견적서는 그 금액 + 부가세 별도", () => {
    assert.deepEqual(suggestAmountKRW(f({ totalAmount: 120000, amountIncludesVat: "no" })), {
      base: 120000, vatExclusive: true, total: 132000,
    });
  });
  it("영수증 합계는 부가세 포함 그대로", () => {
    assert.deepEqual(suggestAmountKRW(f({ totalAmount: 31200, amountIncludesVat: "yes" })), {
      base: 31200, vatExclusive: false, total: 31200,
    });
  });
  it("외화·금액 없음·소수·0은 제안하지 않는다", () => {
    assert.equal(suggestAmountKRW(f({ totalAmount: 2500, currency: "USD" })), null);
    assert.equal(suggestAmountKRW(f({})), null);
    assert.equal(suggestAmountKRW(f({ totalAmount: 1000.5 })), null);
    assert.equal(suggestAmountKRW(f({ totalAmount: 0 })), null);
  });
});

describe("suggestAccount", () => {
  it("예금주·계좌가 있으면 숫자만 남기고 은행은 목록 이름으로", () => {
    assert.deepEqual(suggestAccount(f({ bankName: "국민은행", accountHolder: " 홍길동 ", accountNumber: "123-456-789012" })), {
      bankName: "KB국민은행", accountHolder: "홍길동", accountNumber: "123456789012",
    });
  });
  it("은행을 못 맞추면 은행만 비운다", () => {
    assert.equal(suggestAccount(f({ bankName: "어딘가은행", accountHolder: "a", accountNumber: "12345678" }))?.bankName, null);
  });
  it("예금주나 계좌가 없거나 너무 짧으면 제안하지 않는다", () => {
    assert.equal(suggestAccount(f({ accountHolder: "a", accountNumber: null })), null);
    assert.equal(suggestAccount(f({ accountHolder: null, accountNumber: "12345678" })), null);
    assert.equal(suggestAccount(f({ accountHolder: "a", accountNumber: "1234-567" })), null);
  });
});

describe("normalizeBankName", () => {
  it("흔한 표기를 목록 이름으로", () => {
    assert.equal(normalizeBankName("KB국민"), "KB국민은행");
    assert.equal(normalizeBankName("신한 은행"), "신한은행");
    assert.equal(normalizeBankName("NH농협"), "NH농협은행");
    assert.equal(normalizeBankName("IBK 기업은행"), "IBK기업은행");
    assert.equal(normalizeBankName("카카오뱅크"), "카카오뱅크");
    assert.equal(normalizeBankName("OK저축은행"), "저축은행");
    assert.equal(normalizeBankName("MG새마을금고"), "새마을금고");
    assert.equal(normalizeBankName("Shinhan Bank"), "신한은행");
  });
  it("모르면 null", () => {
    assert.equal(normalizeBankName("JPMorgan Chase"), null);
    assert.equal(normalizeBankName(""), null);
    assert.equal(normalizeBankName(null), null);
  });
});

describe("cardAmountMismatch", () => {
  it("다르면 영수증 금액, 같거나 비교 불가면 null", () => {
    assert.equal(cardAmountMismatch(f({ totalAmount: 12000 }), 12500), 12000);
    assert.equal(cardAmountMismatch(f({ totalAmount: 12500 }), 12500), null);
    assert.equal(cardAmountMismatch(f({ totalAmount: 22, currency: "USD" }), 30000), null);
    assert.equal(cardAmountMismatch(f({ totalAmount: null }), 30000), null);
  });
});
