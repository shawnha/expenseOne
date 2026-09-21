/**
 * 비용계획 오류 매핑 단위 테스트 — 특히 drizzle 이 감싼 오류(QA D-01).
 * 실행: npm run test:unit
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dbErrorCode, mapDbError, PlanError, summarizeError, toSafeError } from "./errors";

/** postgres-js 가 던지는 모양: Error + code + query/parameters 칸. */
function pgError(code: string, message: string): Error {
  const e = new Error(message) as Error & { code: string; query: string; parameters: unknown[] };
  e.name = "PostgresError";
  e.code = code;
  e.query = "insert into expenseone.plan_projects ...";
  e.parameters = ["비밀 프로젝트 이름"];
  return e;
}

/** drizzle 0.45 DrizzleQueryError 모양: message 에 SQL+params, cause 에 드라이버 오류. */
function drizzleWrapped(cause: Error): Error {
  const e = new Error(`Failed query: insert into expenseone.plan_projects ...\nparams: 비밀 프로젝트 이름`, { cause });
  e.name = "DrizzleQueryError";
  return e;
}

describe("dbErrorCode — cause 체인에서 SQLSTATE 를 찾는다", () => {
  it("최상위 code", () => {
    assert.equal(dbErrorCode(pgError("23505", "duplicate key")), "23505");
  });
  it("drizzle 이 감싼 오류(cause 한 단계)", () => {
    assert.equal(dbErrorCode(drizzleWrapped(pgError("23505", "duplicate key"))), "23505");
  });
  it("두 단계 감싸도 찾는다", () => {
    const inner = drizzleWrapped(pgError("57014", "canceling statement due to statement timeout"));
    const outer = new Error("transaction failed", { cause: inner });
    assert.equal(dbErrorCode(outer), "57014");
  });
  it("SQLSTATE 가 아닌 code(ECONNREFUSED)는 건너뛴다", () => {
    const e = new Error("connect") as Error & { code: string };
    e.code = "ECONNREFUSED";
    assert.equal(dbErrorCode(e), null);
    assert.equal(dbErrorCode(new Error("x", { cause: e })), null);
  });
  it("오류 아님·code 없음 → null", () => {
    assert.equal(dbErrorCode(null), null);
    assert.equal(dbErrorCode("boom"), null);
    assert.equal(dbErrorCode(new Error("plain")), null);
  });
});

describe("mapDbError — 감싼 오류도 같은 PlanError 로", () => {
  const cases: Array<[string, string, string]> = [
    ["23505", "CONFLICT", "이미 같은 항목이 있습니다."],
    ["23503", "VALIDATION_ERROR", "참조하는 항목이 없거나 법인이 일치하지 않습니다."],
    ["23514", "VALIDATION_ERROR", "입력값이 허용 범위를 벗어났습니다."],
    ["57014", "INTERNAL_ERROR", "조회 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."],
    ["25006", "INTERNAL_ERROR", "읽기 전용 트랜잭션에서 쓰기를 시도했습니다."],
  ];
  for (const [sqlstate, code, message] of cases) {
    it(`${sqlstate} → ${code} (직접·감싼 것 모두)`, () => {
      for (const err of [pgError(sqlstate, "pg"), drizzleWrapped(pgError(sqlstate, "pg"))]) {
        const mapped = mapDbError(err);
        assert.ok(mapped instanceof PlanError);
        assert.equal(mapped.code, code);
        assert.equal(mapped.message, message);
      }
    });
  }
  it("모르는 SQLSTATE·오류는 그대로 돌려준다", () => {
    const e = drizzleWrapped(pgError("42P01", "relation does not exist"));
    assert.equal(mapDbError(e), e);
    const plain = new Error("plain");
    assert.equal(mapDbError(plain), plain);
  });
});

describe("summarizeError / toSafeError — 로그에 params 를 남기지 않는다", () => {
  it("요약에는 이름·SQLSTATE·안쪽 원인 첫 줄만", () => {
    const s = summarizeError(drizzleWrapped(pgError("42P01", 'relation "x" does not exist')));
    assert.deepEqual(s, { name: "DrizzleQueryError ← PostgresError", code: "42P01", message: 'relation "x" does not exist' });
    assert.ok(!JSON.stringify(s).includes("비밀 프로젝트 이름"));
  });
  it("감싸지 않은 오류는 이름 하나, 여러 줄 메시지는 첫 줄", () => {
    const s = summarizeError(new Error("first\nsecond"));
    assert.deepEqual(s, { name: "Error", code: null, message: "first" });
    assert.deepEqual(summarizeError("boom"), { name: "string", code: null, message: "boom" });
  });
  it("toSafeError: 매핑되면 PlanError, 아니면 params 없는 새 오류(스택 프레임은 유지)", () => {
    const mapped = toSafeError(drizzleWrapped(pgError("23505", "dup")));
    assert.ok(mapped instanceof PlanError);

    const original = drizzleWrapped(pgError("42P01", "relation missing"));
    const safe = toSafeError(original) as Error;
    assert.ok(safe instanceof Error);
    assert.equal(safe.name, "PlanDbError");
    assert.equal(safe.message, "[Plans] DrizzleQueryError ← PostgresError 42P01: relation missing");
    assert.ok(!safe.message.includes("비밀 프로젝트 이름"));
    assert.ok(!(safe.stack ?? "").includes("비밀 프로젝트 이름"));
    assert.ok((safe.stack ?? "").includes("    at "));
    assert.equal(safe.cause, undefined);
  });
});
