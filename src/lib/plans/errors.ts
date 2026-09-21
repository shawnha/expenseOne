// ---------------------------------------------------------------------------
// 비용계획 오류 — 기존 AppError(attachment.service.ts) 와 같은 모양이지만 CONFLICT(409) 가 있다.
// 낙관적 잠금 실패(version 불일치)·마지막 참여자 제거·이미 연결된 요청이 409 라서 필요하다.
// 기존 AppError 에 코드를 더하면 핫 경로 서비스 전부가 다시 컴파일되므로(P6) 계획 전용으로 둔다.
// ---------------------------------------------------------------------------

export type PlanErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export const PLAN_ERROR_STATUS: Record<PlanErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export class PlanError extends Error {
  constructor(
    public code: PlanErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PlanError";
  }
}

/** cause 를 몇 단계까지 따라갈지. 드리즐 → postgres-js 두 단계면 충분하지만 여유를 둔다. */
const MAX_CAUSE_DEPTH = 5;

const SQLSTATE_RE = /^[0-9A-Z]{5}$/;

/**
 * 오류(와 그 cause 체인)에서 postgres SQLSTATE 를 찾는다.
 *
 * drizzle 0.45 는 드라이버 오류를 `DrizzleQueryError` 로 감싸고 원인을 `cause` 에 둔다(QA D-01).
 * 최상위 `err.code` 만 보면 23505(unique)·23503(FK)·23514(CHECK)·57014(timeout) 이 전부 매핑을
 * 비껴가 500 "서버 내부 오류" 가 된다. 문자열 5자리 SQLSTATE 만 인정한다(Node 의 'ECONNREFUSED' 같은
 * 다른 code 는 건너뛰고 계속 내려간다).
 */
export function dbErrorCode(err: unknown): string | null {
  let current: unknown = err;
  for (let depth = 0; depth <= MAX_CAUSE_DEPTH && current && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && SQLSTATE_RE.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/** postgres 오류 코드(SQLSTATE) → PlanError. 알 수 없는 오류는 그대로 돌려준다(라우트가 500 으로). */
export function mapDbError(err: unknown): unknown {
  const code = dbErrorCode(err);
  if (code === null) return err;
  switch (code) {
    case "23505": // unique_violation
      return new PlanError("CONFLICT", "이미 같은 항목이 있습니다.");
    case "23503": // foreign_key_violation — 법인 불일치(복합 FK)·없는 사용자 등
      return new PlanError("VALIDATION_ERROR", "참조하는 항목이 없거나 법인이 일치하지 않습니다.");
    case "23514": // check_violation
      return new PlanError("VALIDATION_ERROR", "입력값이 허용 범위를 벗어났습니다.");
    case "57014": // query_canceled — statement_timeout
      return new PlanError("INTERNAL_ERROR", "조회 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.");
    case "25006": // read_only_sql_transaction
      return new PlanError("INTERNAL_ERROR", "읽기 전용 트랜잭션에서 쓰기를 시도했습니다.");
    default:
      return err;
  }
}

export interface ErrorSummary {
  name: string;
  code: string | null;
  message: string;
}

/**
 * 로그에 남겨도 되는 요약. `DrizzleQueryError.message` 에는 실패한 SQL 과 **params(사용자 입력)** 가
 * 통째로 들어 있고, postgres-js 오류 객체에도 query·parameters 칸이 있다 — 객체를 그대로 console 에
 * 넘기면 그게 전부 로그로 간다. 이름·SQLSTATE·가장 안쪽 원인의 문장만 남긴다.
 */
export function summarizeError(err: unknown): ErrorSummary {
  if (!(err instanceof Error)) {
    return { name: typeof err, code: null, message: String(err) };
  }
  let innermost: Error = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && innermost.cause instanceof Error; depth++) {
    innermost = innermost.cause;
  }
  const code = dbErrorCode(err);
  const wrapped = err !== innermost;
  return {
    name: wrapped ? `${err.name} ← ${innermost.name}` : err.name,
    code,
    message: firstLine(innermost.message),
  };
}

/** 메시지 첫 줄만. 드리즐 문장은 두 번째 줄부터 params 다. */
function firstLine(message: string): string {
  const idx = message.indexOf("\n");
  return idx === -1 ? message : message.slice(0, idx);
}

/**
 * 페이지(서버 컴포넌트)에서 다시 던질 때. Next 가 오류를 통째로 로그에 찍으므로, params 가 든 원본
 * 대신 요약 문장만 가진 오류로 바꾼다. 스택은 프레임 줄만 옮겨 온다(첫 줄의 메시지는 버린다).
 */
export function toSafeError(err: unknown): unknown {
  const mapped = mapDbError(err);
  if (mapped instanceof PlanError) return mapped;
  if (!(err instanceof Error)) return err;
  const s = summarizeError(err);
  const safe = new Error(`[Plans] ${s.name}${s.code ? ` ${s.code}` : ""}: ${s.message}`);
  safe.name = "PlanDbError";
  const frames = (err.stack ?? "").split("\n").filter((line) => line.startsWith("    at "));
  safe.stack = `${safe.name}: ${safe.message}\n${frames.join("\n")}`;
  return safe;
}
