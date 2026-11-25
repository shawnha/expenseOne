import { sql, type SQL } from "drizzle-orm";
import { hasExpenseCompanyGrant } from "@/lib/db/expense-company-access";
import type { PlanTx } from "@/lib/db/plans-client";
import { PlanError } from "./errors";
import { rowsOf } from "./rows";

// ---------------------------------------------------------------------------
// 비용계획 권한 (SCHEMA.md 3절)
//
//   E        : 대표인가 — plan_executives 에 revoked_at IS NULL 행
//   P($uid)  : 내 사업 집합 — plan_project_members 행이 있고 사업이 삭제되지 않음
//   M(proj)  : E OR proj ∈ P($uid) — 수정 및 참여자 관리
//   R(proj)  : M(proj) 또는 활성 리더가 담당 법인으로 지정된 프로젝트
//
// **created_by_id 는 술어에 넣지 않는다**(V-SECURITY-1). 수정 권한은 참여자 행에 근거하므로
// member/REMOVE 가 만든 사람에게도 즉시 유효하다. users.role(ADMIN) 자체는 조회·수정 권한을 주지 않고,
// 입금요청 **연결 범위**(본인 제출분만 vs 법인 전부)에만 쓴다(SCHEMA.md 5절 7).
//
// 앞부분은 순수 술어(단위 테스트), 뒷부분은 같은 규칙을 SQL 로 옮긴 DB 검사다.
// M(project) 자체는 순수 함수로 두지 않는다 — 실제 판정은 requireProjectAccess·requirePlanAccess 의
// SQL 뿐이라, 같은 규칙을 JS 로 한 벌 더 두면 아무도 부르지 않는 함수가 테스트만 초록으로 만든다.
// ---------------------------------------------------------------------------

export interface PlanAccess {
  userId: string;
  role: "MEMBER" | "ADMIN";
  isExecutive: boolean;
}

// --- 순수 술어 ----------------------------------------------------------------

/** 연결 후보 범위: 대표·ADMIN 은 그 법인 요청 전부, MEMBER 는 본인이 제출한 요청만. */
export function canLinkAllCompanyRequests(access: { isExecutive: boolean; role: "MEMBER" | "ADMIN" }): boolean {
  return access.isExecutive || access.role === "ADMIN";
}

/** 메모 수정·삭제: 작성자 본인만, 삭제된 메모는 불가. author_id NULL(사용자 삭제 뒤)은 아무도 못 고친다. */
export function canEditComment(
  comment: { authorId: string | null; deletedAt: Date | string | null },
  userId: string,
): boolean {
  if (comment.deletedAt) return false;
  if (comment.authorId == null) return false;
  return comment.authorId === userId;
}

/** 참여자 제거 가능 여부: 마지막 참여자는 제거할 수 없다(409). */
export function canRemoveMember(currentMemberCount: number): boolean {
  return currentMemberCount > 1;
}

/** 대상 회사가 첫 출시 범위(KRW·활성)인가. HOI(USD)·비활성은 제외(Q9). */
export function isPlannableCompany(company: { currency: string; isActive: boolean }): boolean {
  return company.isActive && company.currency === "KRW";
}

// --- SQL 조각 -----------------------------------------------------------------

/** P($uid): 내 사업 id 집합 서브쿼리. `col IN ${memberProjectIdsSql(uid)}` 로 쓴다. */
export function memberProjectIdsSql(userId: string): SQL {
  return sql`(SELECT m.project_id
                FROM expenseone.plan_project_members m
                JOIN expenseone.plan_projects j ON j.id = m.project_id AND j.deleted_at IS NULL
               WHERE m.user_id = ${userId}::uuid)`;
}

/**
 * 변경할 수 있는 프로젝트 범위. 대표면 TRUE, 아니면 `projectIdColumn IN P($uid)`.
 * projectIdColumn 은 `sql\`p.project_id\`` 처럼 호출부의 별칭에 맞춘 조각.
 */
export function projectScopeSql(access: { userId: string; isExecutive: boolean }, projectIdColumn: SQL): SQL {
  if (access.isExecutive) return sql`TRUE`;
  return sql`${projectIdColumn} IN ${memberProjectIdsSql(access.userId)}`;
}

/** 조회 경로만 사용한다. 사용자 기본 소속이 아니라 관리자 화면에 저장한 담당 법인을 확인한다. */
export function projectReadScopeSql(access: PlanAccess, projectIdColumn: SQL): SQL {
  const editable = projectScopeSql(access, projectIdColumn);
  if (access.isExecutive || access.role !== "MEMBER") return editable;
  return sql`(${editable} OR EXISTS (
    SELECT 1
      FROM expenseone.plan_projects lp
      JOIN expenseone.companies lc ON lc.id = lp.company_id AND lc.is_active = true AND lc.currency = 'KRW'
      JOIN expenseone.users lu ON lu.id = ${access.userId}::uuid AND lu.is_active = true AND lu.role = 'MEMBER'
     WHERE lp.id = ${projectIdColumn} AND lp.deleted_at IS NULL
       AND ${hasExpenseCompanyGrant(sql`lu.id`, sql`lp.company_id`)}
  ))`;
}

// --- DB 검사 (요청마다, 캐시 없음 — 15명 규모) ---------------------------------------

/** E: 대표인가. */
export async function isExecutive(tx: PlanTx, userId: string): Promise<boolean> {
  const rows = rowsOf<{ ok: boolean }>(
    await tx.execute(sql`SELECT EXISTS (
        SELECT 1 FROM expenseone.plan_executives x
         WHERE x.user_id = ${userId}::uuid AND x.revoked_at IS NULL) AS ok`),
  );
  return rows[0]?.ok === true;
}

/** 요청 주체의 권한 묶음을 한 번에. 서비스 함수의 첫 줄. */
export async function loadAccess(
  tx: PlanTx,
  actor: { userId: string; role: "MEMBER" | "ADMIN" },
): Promise<PlanAccess> {
  return { userId: actor.userId, role: actor.role, isExecutive: await isExecutive(tx, actor.userId) };
}

export interface ProjectAccessRow {
  id: string;
  companyId: string;
  name: string;
}

/**
 * M(project) 를 DB 로 판정. 0행이면 404(존재 여부를 알려주지 않는다).
 * 삭제된 사업도 404.
 */
export async function requireProjectAccess(
  tx: PlanTx,
  access: PlanAccess,
  projectId: string,
): Promise<ProjectAccessRow> {
  const rows = rowsOf<{ id: string; company_id: string; name: string }>(
    await tx.execute(sql`SELECT j.id, j.company_id, j.name
        FROM expenseone.plan_projects j
       WHERE j.id = ${projectId}::uuid AND j.deleted_at IS NULL
         AND (${access.isExecutive}::boolean OR EXISTS (
               SELECT 1 FROM expenseone.plan_project_members m
                WHERE m.project_id = j.id AND m.user_id = ${access.userId}::uuid))`),
  );
  const row = rows[0];
  if (!row) throw new PlanError("NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  return { id: row.id, companyId: row.company_id, name: row.name };
}

export interface PlanAccessRow {
  id: string;
  companyId: string;
  projectId: string;
  version: number;
  status: string;
  canManage: boolean;
}

/**
 * (c) 계획 상세 접근 판정 — 모든 상세·수정·메모·연결 API 의 첫 쿼리. 0행 → 404.
 * `forUpdate` 면 같은 트랜잭션의 version 검사와 직렬화한다. 조회 범위는 본문을 바꾸지 않는 경로에서만 쓴다.
 */
export async function requirePlanAccess(
  tx: PlanTx,
  access: PlanAccess,
  planId: string,
  options: { forUpdate?: boolean; includeReadOnly?: boolean } = {},
): Promise<PlanAccessRow> {
  const lock = options.forUpdate ? sql` FOR UPDATE OF p` : sql``;
  const projectId = sql`p.project_id`;
  const editable = projectScopeSql(access, projectId);
  const visible = options.includeReadOnly ? projectReadScopeSql(access, projectId) : editable;
  const rows = rowsOf<{ id: string; company_id: string; project_id: string; version: number; status: string; can_manage: boolean }>(
    await tx.execute(sql`SELECT p.id, p.company_id, p.project_id, p.version, p.status,
                               ${options.includeReadOnly ? editable : sql`TRUE`} AS can_manage
        FROM expenseone.cost_plans p
       WHERE p.id = ${planId}::uuid AND p.deleted_at IS NULL
         AND EXISTS (SELECT 1 FROM expenseone.plan_projects j0
                      WHERE j0.id = p.project_id AND j0.deleted_at IS NULL)
         AND ${visible}${lock}`),
  );
  const row = rows[0];
  if (!row) throw new PlanError("NOT_FOUND", "계획을 찾을 수 없습니다.");
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    version: Number(row.version),
    status: row.status,
    canManage: row.can_manage,
  };
}

/** 대표만 할 수 있는 동작(브랜드 등록 등). */
export function requireExecutive(access: PlanAccess): void {
  if (!access.isExecutive) throw new PlanError("FORBIDDEN", "대표만 할 수 있는 작업입니다.");
}
