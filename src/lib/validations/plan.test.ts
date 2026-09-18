/**
 * 비용계획 zod 스키마 단위 테스트 — DB CHECK 와 같은 범위인지.
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  boardQuerySchema,
  cancelPlanSchema,
  commentBodySchema,
  createBrandSchema,
  createPlanSchema,
  createProjectSchema,
  linkExpenseSchema,
  PLAN_AMOUNT_MAX,
  searchParamsToObject,
  updatePlanSchema,
} from "./plan";

const C = "3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c";
const P = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("createPlanSchema", () => {
  const ok = { companyId: C, projectId: P, title: "  촬영비  ", amount: 1_500_000, plannedDate: "2026-10-15" };
  it("최소 입력을 받고 datePrecision 기본 DAY, 빈 선택 칸은 null", () => {
    const r = createPlanSchema.parse(ok);
    assert.equal(r.title, "촬영비");
    assert.equal(r.datePrecision, "DAY");
    assert.equal(r.vendorName, null);
    assert.equal(r.description, null);
    assert.equal(r.brandId, null);
  });
  it("빈 문자열 거래처는 null 로(CHECK btrim ≥1)", () => {
    const r = createPlanSchema.parse({ ...ok, vendorName: "   ", brandId: null });
    assert.equal(r.vendorName, null);
    assert.equal(r.brandId, null);
  });
  it("금액은 양의 정수, integer 상한", () => {
    assert.equal(createPlanSchema.safeParse({ ...ok, amount: 0 }).success, false);
    assert.equal(createPlanSchema.safeParse({ ...ok, amount: 10.5 }).success, false);
    assert.equal(createPlanSchema.safeParse({ ...ok, amount: -1 }).success, false);
    assert.equal(createPlanSchema.safeParse({ ...ok, amount: PLAN_AMOUNT_MAX }).success, true);
    assert.equal(createPlanSchema.safeParse({ ...ok, amount: PLAN_AMOUNT_MAX + 1 }).success, false);
  });
  it("제목 200자·설명 4000자·거래처 200자 상한, 날짜 형식", () => {
    assert.equal(createPlanSchema.safeParse({ ...ok, title: "x".repeat(201) }).success, false);
    assert.equal(createPlanSchema.safeParse({ ...ok, title: "   " }).success, false);
    assert.equal(createPlanSchema.safeParse({ ...ok, description: "x".repeat(4001) }).success, false);
    assert.equal(createPlanSchema.safeParse({ ...ok, vendorName: "x".repeat(201) }).success, false);
    assert.equal(createPlanSchema.safeParse({ ...ok, plannedDate: "2026.10.15" }).success, false);
    assert.equal(createPlanSchema.safeParse({ ...ok, datePrecision: "WEEK" }).success, false);
    assert.equal(createPlanSchema.safeParse({ ...ok, brandId: "not-a-uuid" }).success, false);
  });
});

describe("updatePlanSchema — version 필수, 바꿀 칸 하나 이상", () => {
  it("version 없으면 거부", () => {
    assert.equal(updatePlanSchema.safeParse({ title: "a" }).success, false);
  });
  it("version 만 있으면 거부(변경 없음)", () => {
    assert.equal(updatePlanSchema.safeParse({ version: 1 }).success, false);
  });
  it("brandId: null 도 변경으로 친다(공통으로 되돌리기)", () => {
    const r = updatePlanSchema.safeParse({ version: 3, brandId: null });
    assert.equal(r.success, true);
  });
  it("companyId·createdById 는 받지 않는다(무시)", () => {
    const r = updatePlanSchema.parse({ version: 1, title: "x", companyId: C, createdById: P });
    assert.equal("companyId" in r, false);
    assert.equal("createdById" in r, false);
  });
});

describe("cancelPlanSchema / commentBodySchema / linkExpenseSchema", () => {
  it("취소는 version 필수, 사유 선택", () => {
    assert.equal(cancelPlanSchema.safeParse({}).success, false);
    assert.deepEqual(cancelPlanSchema.parse({ version: 2 }), { version: 2, reason: null });
    assert.equal(cancelPlanSchema.parse({ version: 2, reason: " 예산 삭감 " }).reason, "예산 삭감");
  });
  it("메모는 공백만 불가, 4000자 상한", () => {
    assert.equal(commentBodySchema.safeParse({ body: "  " }).success, false);
    assert.equal(commentBodySchema.safeParse({ body: "x".repeat(4001) }).success, false);
    assert.equal(commentBodySchema.parse({ body: " 확인했어요 " }).body, "확인했어요");
  });
  it("연결은 expenseId 만 받는다(스냅샷 값은 서버가 SELECT 로)", () => {
    const r = linkExpenseSchema.parse({ expenseId: B, snapshotAmount: 1 });
    assert.deepEqual(r, { expenseId: B });
    assert.equal(linkExpenseSchema.safeParse({ expenseId: "x" }).success, false);
  });
});

describe("createProjectSchema / createBrandSchema", () => {
  it("이름 trim·100자, 회사 uuid", () => {
    assert.equal(createProjectSchema.parse({ companyId: C, name: " 신규 브랜드 런칭 " }).name, "신규 브랜드 런칭");
    assert.equal(createProjectSchema.safeParse({ companyId: C, name: "x".repeat(101) }).success, false);
    assert.equal(createProjectSchema.safeParse({ companyId: "korea", name: "a" }).success, false);
    assert.equal(createBrandSchema.parse({ companyId: C, name: "ODD", categoryCode: "" }).categoryCode, null);
  });
});

describe("boardQuerySchema — 문자열 쿼리에서", () => {
  it("기본값: months 4, status PLANNED", () => {
    const r = boardQuerySchema.parse({});
    assert.equal(r.months, 4);
    assert.equal(r.status, "PLANNED");
    assert.equal(r.from, undefined);
  });
  it("from 은 YYYY-MM, months 1~12, brandId 는 uuid 또는 none", () => {
    assert.equal(boardQuerySchema.safeParse({ from: "2026-9" }).success, false);
    assert.equal(boardQuerySchema.safeParse({ from: "2026-13" }).success, false);
    assert.equal(boardQuerySchema.parse({ from: "2026-09", months: "6" }).months, 6);
    assert.equal(boardQuerySchema.safeParse({ months: "13" }).success, false);
    assert.equal(boardQuerySchema.safeParse({ months: "0" }).success, false);
    assert.equal(boardQuerySchema.parse({ brandId: "none" }).brandId, "none");
    assert.equal(boardQuerySchema.parse({ brandId: B }).brandId, B);
    assert.equal(boardQuerySchema.safeParse({ brandId: "all" }).success, false);
    assert.equal(boardQuerySchema.parse({ status: "ALL" }).status, "ALL");
  });
  it("searchParamsToObject 는 빈 값을 버린다(기본값이 살도록)", () => {
    const o = searchParamsToObject(new URLSearchParams("from=2026-09&companyId=&months=4"));
    assert.deepEqual(o, { from: "2026-09", months: "4" });
  });
});
