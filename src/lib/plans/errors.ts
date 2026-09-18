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

/** postgres 오류 코드(SQLSTATE) → PlanError. 알 수 없는 오류는 그대로 돌려준다(라우트가 500 으로). */
export function mapDbError(err: unknown): unknown {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code !== "string") return err;
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
