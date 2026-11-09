import { test } from "node:test";
import assert from "node:assert/strict";
import { matchDocumentCompanies, companyNameKey, type DocumentCompany } from "./company";
import type { OcrFields } from "./types";

const companies: DocumentCompany[] = [
  { id: "korea", name: "한아원코리아", businessNumber: "1968103665", aliases: ["주식회사 한아원코리아"] },
  { id: "partners", name: "한아원파트너스", businessNumber: "2228604274" },
  { id: "hoi", name: "HOI", businessNumber: null, aliases: ["HOI Inc."] },
];
const f = (patch: Partial<OcrFields>): OcrFields => ({ docType: "견적서", merchantName: "판매 업체", totalAmount: null, amountIncludesVat: "unknown", supplyAmount: null, vatAmount: null, currency: "KRW", date: null, bankName: null, accountHolder: null, accountNumber: null, cardLast4: null, confidence: "high", note: "", ...patch });
const match = (...fields: OcrFields[]) => matchDocumentCompanies(fields, companies);

test("실제 자금청구서: 축약 상호 주식회사 한아원도 등록번호로 코리아를 찾는다", () => {
  const result = match(f({ recipientCompanyName: "주식회사 한아원", recipientBusinessNumber: "196-81-03665" }));
  assert.equal(result.kind, "match");
  if (result.kind === "match") {
    assert.equal(result.company.id, "korea"); assert.equal(result.by, "businessNumber"); assert.equal(result.automatic, true);
  }
});
test("상호의 공백·법인 표기를 정규화하되 부분 일치는 하지 않는다", () => {
  assert.equal(companyNameKey("㈜ 한아원 코리아"), companyNameKey("주식회사 한아원코리아"));
  assert.equal(match(f({ recipientCompanyName: "(주) 한아원 코리아" })).kind, "match");
  assert.equal(match(f({ recipientCompanyName: "한아원" })).kind, "conflict");
});
test("공급자나 예금주가 우리 회사여도 수신자 정보가 없으면 선택하지 않는다", () => {
  assert.equal(match(f({ merchantName: "한아원코리아", accountHolder: "한아원파트너스" })).kind, "none");
});
test("판매자의 사업자등록증·통장사본에서는 법인을 추론하지 않는다", () => {
  for (const docType of ["사업자등록증", "통장사본", "신분증"] as const) {
    assert.equal(match(f({ docType, recipientBusinessNumber: "1968103665" })).kind, "none");
  }
});
test("회사명과 사업자번호가 다르면 자동 선택하지 않는다", () => {
  assert.equal(match(f({ recipientCompanyName: "한아원파트너스", recipientBusinessNumber: "1968103665" })).kind, "conflict");
});
test("미등록·깨진 번호를 이름만으로 무시하지 않는다", () => {
  for (const recipientBusinessNumber of ["1968103666", "196810366", "999-99-99999"]) {
    assert.equal(match(f({ recipientCompanyName: "한아원코리아", recipientBusinessNumber })).kind, "conflict");
  }
});
test("여러 첨부의 법인이 다르면 첫 파일로 임의 선택하지 않는다", () => {
  assert.equal(match(f({ recipientBusinessNumber: "1968103665" }), f({ recipientBusinessNumber: "2228604274" })).kind, "conflict");
});
test("같은 법인의 여러 첨부와 회사명만 있는 외국 법인을 인식한다", () => {
  assert.equal(match(f({ recipientBusinessNumber: "1968103665" }), f({ recipientCompanyName: "한아원코리아" })).kind, "match");
  const hoi = match(f({ recipientCompanyName: "HOI Inc." }));
  assert.equal(hoi.kind === "match" && hoi.company.id, "hoi");
});
test("낮은 신뢰도는 일치해도 자동 적용하지 않는다", () => {
  for (const confidence of ["low", "medium"] as const) {
    const result = match(f({ recipientBusinessNumber: "1968103665", confidence }));
    assert.equal(result.kind === "match" && result.automatic, false);
  }
});
test("비활성·선택 불가 법인과 겹치는 등록번호는 자동 선택하지 않는다", () => {
  const field = f({ recipientBusinessNumber: "1968103665" });
  assert.equal(matchDocumentCompanies([field], []).kind, "conflict");
  assert.equal(matchDocumentCompanies([field], [...companies, { ...companies[0], id: "duplicate" }]).kind, "conflict");
});
test("수신 법인 정보가 있는 첨부를 지우면 제안도 사라진다", () => {
  assert.equal(match().kind, "none");
});
