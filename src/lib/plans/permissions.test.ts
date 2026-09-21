/**
 * 비용계획 권한 순수 술어 단위 테스트 (SCHEMA.md 3절).
 * created_by_id 는 어디에도 등장하지 않는다 — 권한 근거는 참여자 행뿐(V-SECURITY-1).
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canEditComment,
  canLinkAllCompanyRequests,
  canRemoveMember,
  isPlannableCompany,
  memberProjectIdsSql,
  projectScopeSql,
} from "./permissions";
import { sql, type BuildQueryConfig } from "drizzle-orm";
import { CasingCache } from "drizzle-orm/casing";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("canLinkAllCompanyRequests — users.role 은 연결 범위에만", () => {
  it("대표·ADMIN 은 법인 전부, MEMBER 는 본인 제출분만", () => {
    assert.equal(canLinkAllCompanyRequests({ isExecutive: true, role: "MEMBER" }), true);
    assert.equal(canLinkAllCompanyRequests({ isExecutive: false, role: "ADMIN" }), true);
    assert.equal(canLinkAllCompanyRequests({ isExecutive: false, role: "MEMBER" }), false);
  });
});

describe("canEditComment — 본인 것만, 삭제된 것·작성자 NULL 은 불가", () => {
  it("본인 메모", () => {
    assert.equal(canEditComment({ authorId: ME, deletedAt: null }, ME), true);
  });
  it("남의 메모·삭제된 메모·작성자 삭제 뒤", () => {
    assert.equal(canEditComment({ authorId: OTHER, deletedAt: null }, ME), false);
    assert.equal(canEditComment({ authorId: ME, deletedAt: new Date() }, ME), false);
    assert.equal(canEditComment({ authorId: ME, deletedAt: "2026-09-18T00:00:00Z" }, ME), false);
    assert.equal(canEditComment({ authorId: null, deletedAt: null }, ME), false);
  });
});

describe("canRemoveMember — 마지막 참여자는 제거 불가(409)", () => {
  it("2명 이상일 때만", () => {
    assert.equal(canRemoveMember(1), false);
    assert.equal(canRemoveMember(0), false);
    assert.equal(canRemoveMember(2), true);
  });
});

// 실제 판정 경로: plan.service.ts 의 assertPlannableCompany 가 companies 한 행을 읽어 이 함수에 넘긴다.
describe("isPlannableCompany — 첫 출시는 KRW·활성 법인만(Q9)", () => {
  it("HOI(USD)·비활성 제외", () => {
    assert.equal(isPlannableCompany({ currency: "KRW", isActive: true }), true);
    assert.equal(isPlannableCompany({ currency: "USD", isActive: true }), false);
    assert.equal(isPlannableCompany({ currency: "KRW", isActive: false }), false);
  });
});

// drizzle 의 SQL 조각을 문자열로 펼치기 위한 최소 설정. 실제 방언 대신 자리표시자만 센다.
const QUERY_CONFIG: BuildQueryConfig = {
  escapeName: (n) => n,
  escapeParam: (i) => `$${i + 1}`,
  escapeString: (s) => s,
  casing: new CasingCache(),
};

describe("SQL 조각", () => {
  it("P(uid) 서브쿼리는 참여자 행 + 사업 삭제 여부만 본다 (created_by_id 없음)", () => {
    const q = memberProjectIdsSql(ME).toQuery(QUERY_CONFIG);
    assert.match(q.sql, /plan_project_members/);
    assert.match(q.sql, /deleted_at IS NULL/);
    assert.doesNotMatch(q.sql, /created_by/);
    assert.deepEqual(q.params, [ME]);
  });
  it("대표는 TRUE, 아니면 IN (P(uid))", () => {
    const exec = projectScopeSql({ userId: ME, isExecutive: true }, sql`p.project_id`).toQuery(QUERY_CONFIG);
    assert.equal(exec.sql.trim(), "TRUE");
    assert.deepEqual(exec.params, []);
    const member = projectScopeSql({ userId: ME, isExecutive: false }, sql`p.project_id`).toQuery(QUERY_CONFIG);
    assert.match(member.sql, /^p\.project_id IN \(SELECT m\.project_id/);
    assert.deepEqual(member.params, [ME]);
  });
});
