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
  issuesMessage,
  linkExpenseSchema,
  PLAN_AMOUNT_MAX,
  planErpSchema,
  searchParamsToObject,
  updatePlanSchema,
  unlinkQuerySchema,
} from "./plan";
import { monthRange } from "@/lib/plans/diff";
import {
  erpAppliedStamp,
  erpAppliedText,
  erpMenuLabel,
  erpToggleToast,
  kstDateLabel,
} from "@/lib/plans/erp";

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
    assert.equal(createPlanSchema.safeParse({ ...ok, datePrecision: "MONTH_EARLY" }).success, true);
    assert.equal(createPlanSchema.safeParse({ ...ok, datePrecision: "MONTH_MID" }).success, true);
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

  it("memberIds 는 없으면 빈 배열, uuid 만, 최대 50명", () => {
    assert.deepEqual(createProjectSchema.parse({ companyId: C, name: "a" }).memberIds, []);
    const two = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    assert.deepEqual(createProjectSchema.parse({ companyId: C, name: "a", memberIds: two }).memberIds, two);
    assert.equal(createProjectSchema.safeParse({ companyId: C, name: "a", memberIds: ["nope"] }).success, false);
    const many = Array.from({ length: 51 }, (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`);
    assert.equal(createProjectSchema.safeParse({ companyId: C, name: "a", memberIds: many }).success, false);
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
  // zod 가 통과시킨 월은 monthRange(diff.ts)가 반드시 계산할 수 있어야 한다. 범위가 어긋나면
  // 검증은 성공하고 계산이 RangeError 로 터져, 페이지의 기본값 폴백이 아니라 오류 화면이 뜬다.
  it("연도는 parseMonth 와 같은 2000~2100 범위만", () => {
    assert.equal(boardQuerySchema.safeParse({ from: "1899-01" }).success, false);
    assert.equal(boardQuerySchema.safeParse({ from: "1999-12" }).success, false);
    assert.equal(boardQuerySchema.safeParse({ from: "2101-01" }).success, false);
    assert.equal(boardQuerySchema.parse({ from: "2000-01" }).from, "2000-01");
    assert.equal(boardQuerySchema.parse({ from: "2100-12" }).from, "2100-12");
  });
  it("통과한 from 은 monthRange 가 던지지 않는다", () => {
    for (const v of ["1899-01", "2101-01", "2000-01", "2100-12", "2026-09"]) {
      const parsed = boardQuerySchema.safeParse({ from: v });
      if (!parsed.success) continue;
      assert.doesNotThrow(() => monthRange(parsed.data.from!, parsed.data.months));
    }
  });
  it("searchParamsToObject 는 빈 값을 버린다(기본값이 살도록)", () => {
    const o = searchParamsToObject(new URLSearchParams("from=2026-09&companyId=&months=4"));
    assert.deepEqual(o, { from: "2026-09", months: "4" });
  });
});

describe("unlinkQuerySchema — 연결 해제", () => {
  it("linkId 는 uuid 필수 (쿼리스트링에서 온다)", () => {
    const ok = unlinkQuerySchema.safeParse({ linkId: "3f1a0c5e-7b2d-4c1a-9e8f-0a1b2c3d4e5f" });
    assert.equal(ok.success, true);
    assert.equal(unlinkQuerySchema.safeParse({ linkId: "abc" }).success, false);
    assert.equal(unlinkQuerySchema.safeParse({}).success, false);
  });
  it("searchParamsToObject 를 거친 값이 그대로 통과한다", () => {
    const params = new URLSearchParams("linkId=3f1a0c5e-7b2d-4c1a-9e8f-0a1b2c3d4e5f&q=");
    const parsed = unlinkQuerySchema.safeParse(searchParamsToObject(params));
    assert.equal(parsed.success, true);
  });
});

describe("issuesMessage — 영문 기본 문구는 한국어로 (QA D-13)", () => {
  it("타입 불일치는 칸 이름과 함께 한국어 공통 문구", () => {
    const r = createPlanSchema.safeParse({
      companyId: "3f1a0c5e-7b2d-4c1a-9e8f-0a1b2c3d4e5f",
      projectId: "3f1a0c5e-7b2d-4c1a-9e8f-0a1b2c3d4e5f",
      title: "t",
      amount: "1000",
      plannedDate: "2026-09-01",
    });
    assert.equal(r.success, false);
    if (!r.success) {
      const msg = issuesMessage(r.error);
      assert.equal(msg, "금액이 올바르지 않습니다");
      assert.ok(!/[A-Za-z]/.test(msg), msg);
    }
  });
  it("우리가 단 한국어 문구는 그대로, 조사는 병기 없이", () => {
    const r = createPlanSchema.safeParse({
      companyId: "3f1a0c5e-7b2d-4c1a-9e8f-0a1b2c3d4e5f",
      projectId: "3f1a0c5e-7b2d-4c1a-9e8f-0a1b2c3d4e5f",
      title: "t",
      amount: 1000,
      plannedDate: "2026-09-01",
      vendorName: "x".repeat(201),
    });
    assert.equal(r.success, false);
    if (!r.success) assert.equal(issuesMessage(r.error), "거래처는 200자 이내로 입력해주세요");
  });
});

describe("boardQuerySchema — brandName (이름 기반 분류 필터, QA D2-05)", () => {
  it("공백을 다듬고, 빈 값·101자는 거부한다", () => {
    assert.equal(boardQuerySchema.parse({ brandName: " 마케팅 " }).brandName, "마케팅");
    assert.equal(boardQuerySchema.parse({}).brandName, undefined);
    assert.equal(boardQuerySchema.safeParse({ brandName: "   " }).success, false);
    assert.equal(boardQuerySchema.safeParse({ brandName: "x".repeat(101) }).success, false);
  });
  it("brandId=none 과 함께 올 수 있다(둘 다 건다)", () => {
    const parsed = boardQuerySchema.parse({ brandId: "none", brandName: "마케팅" });
    assert.equal(parsed.brandId, "none");
    assert.equal(parsed.brandName, "마케팅");
  });
});

describe("planErpSchema — ERP 반영 표시(0023)", () => {
  it("applied 는 boolean 만 받는다", () => {
    assert.deepEqual(planErpSchema.parse({ applied: true }), { applied: true });
    assert.deepEqual(planErpSchema.parse({ applied: false }), { applied: false });
  });
  it("문자열·숫자·null·빠짐은 거부한다(\"true\" 를 참으로 읽지 않는다)", () => {
    for (const applied of ["true", "false", 1, 0, null, undefined]) {
      assert.equal(planErpSchema.safeParse({ applied }).success, false, String(applied));
    }
    assert.equal(planErpSchema.safeParse({}).success, false);
  });
  it("version 등 다른 칸은 버린다(장부 표시라 낙관적 잠금 대상이 아니다)", () => {
    assert.deepEqual(planErpSchema.parse({ applied: true, version: 3, erpAppliedById: P }), { applied: true });
  });
  it("오류 문구는 한국어", () => {
    const r = planErpSchema.safeParse({ applied: "yes" });
    assert.equal(r.success, false);
    if (!r.success) assert.equal(issuesMessage(r.error), "ERP 반영 여부가 올바르지 않습니다");
  });
});

describe("ERP 반영 표시 문구 (lib/plans/erp)", () => {
  it("날짜는 KST 로 — UTC 자정 전후에도 한국 날짜", () => {
    assert.equal(kstDateLabel("2026-09-21T15:00:00.000Z"), "2026.09.22");
    assert.equal(kstDateLabel("2026-09-21T14:59:59.000Z"), "2026.09.21");
    assert.equal(kstDateLabel("2026-12-31T16:00:00Z"), "2027.01.01");
    assert.equal(kstDateLabel("nope"), null);
  });
  it("표시 = 날짜 · 이름, 이름이 없으면 날짜만, 미반영은 null", () => {
    assert.equal(erpAppliedStamp("2026-09-22T01:30:00Z", "하승완"), "2026.09.22 · 하승완");
    assert.equal(erpAppliedStamp("2026-09-22T01:30:00Z", null), "2026.09.22");
    assert.equal(erpAppliedStamp(null, "하승완"), null);
  });
  it("읽기 전용 한 줄", () => {
    assert.equal(erpAppliedText("2026-09-22T01:30:00Z", "하승완"), "반영됨 · 2026.09.22 · 하승완");
    assert.equal(erpAppliedText("2026-09-22T01:30:00Z", null), "반영됨 · 2026.09.22");
    assert.equal(erpAppliedText(null, null), "아직 반영 안 됨");
  });
  it("메뉴는 지금 상태의 반대 동작, 토스트는 바뀐 뒤 상태", () => {
    assert.equal(erpMenuLabel(false), "ERP 반영 표시");
    assert.equal(erpMenuLabel(true), "ERP 반영 해제");
    assert.equal(erpToggleToast(true), "ERP 반영으로 표시했습니다.");
    assert.equal(erpToggleToast(false), "ERP 반영 표시를 해제했습니다.");
  });
});
