import { z } from "zod";
import { withJosa } from "@/lib/plans/josa";

// ---------------------------------------------------------------------------
// 비용계획 입력 검증 (서버 라우트 + 클라이언트 폼 공용). DB CHECK 와 같은 범위로 맞춘다
// (SCHEMA.md 1절): title ≤200, description ≤4000, vendor ≤200, amount > 0 정수, 통화 KRW 만.
// ---------------------------------------------------------------------------

export const COST_PLAN_STATUSES = ["PLANNED", "CANCELLED", "CLOSED"] as const;
export const DATE_PRECISIONS = ["DAY", "MONTH"] as const;

/** integer 칸 상한. 원 단위라 21억 원까지. */
export const PLAN_AMOUNT_MAX = 2_147_483_647;

const uuidField = (label: string) => z.string().uuid(`올바른 ${label} ID가 아닙니다`);

const isoDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD여야 합니다");

// 연도 범위는 diff.ts 의 parseMonth(2000~2100)와 **같아야 한다**. 넓게 두면 zod 는 통과시키고
// monthRange 가 RangeError 를 던져, 주소를 손으로 고친 한 건이 보드 전체를 오류 화면으로 만든다.
const monthField = z
  .string()
  .regex(/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/, "월 형식은 YYYY-MM이어야 합니다(2000~2100)");

/**
 * 선택 텍스트. 빈 문자열·공백만이면 null 로(DB CHECK btrim 길이 ≥1 과 맞춤).
 * **보내지 않은(undefined) 칸은 undefined 로 남긴다** — 수정 스키마가 "바꾸지 않음"과 "null 로 지움"을 구분한다.
 */
function optionalText(max: number, label: string) {
  return z
    .string()
    .max(max, `${withJosa(label, "은/는")} ${max}자 이내로 입력해주세요`)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v && v.trim().length > 0 ? v.trim() : null));
}

/** 생성용: 보내지 않은 칸도 null 로(INSERT 값). */
function nullableText(max: number, label: string) {
  return optionalText(max, label).transform((v) => v ?? null);
}

const amountField = z
  .number()
  .int("금액은 정수여야 합니다")
  .positive("금액은 0보다 커야 합니다")
  .max(PLAN_AMOUNT_MAX, "금액이 너무 큽니다");

// --- 프로젝트 ---------------------------------------------------------------

export const createProjectSchema = z.object({
  companyId: uuidField("회사"),
  name: z.string().trim().min(1, "프로젝트 이름을 입력해주세요").max(100, "프로젝트 이름은 100자 이내로 입력해주세요"),
  description: nullableText(2000, "설명"),
  /** 만들 때 같이 넣을 참여자. 만든 사람은 항상 포함되므로 여기 없어도 된다(중복은 무시). */
  memberIds: z.array(uuidField("사용자")).max(50, "참여자는 한 번에 50명까지 추가할 수 있습니다").default([]),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const projectMemberSchema = z.object({
  userId: uuidField("사용자"),
});
export type ProjectMemberInput = z.infer<typeof projectMemberSchema>;

export const projectsQuerySchema = z.object({
  companyId: uuidField("회사").optional(),
});

// --- 분류(plan_brands) ----------------------------------------------------------
// 표·API 이름은 brand 그대로, 화면 말은 "분류"(제품 개발·마케팅 같은 하위 카테고리, v1.1 오너 피드백).

export const createBrandSchema = z.object({
  companyId: uuidField("회사"),
  name: z.string().trim().min(1, "분류 이름을 입력해주세요").max(100, "분류 이름은 100자 이내로 입력해주세요"),
  categoryCode: nullableText(100, "카테고리 코드"),
});
export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export const brandsQuerySchema = z.object({
  companyId: uuidField("회사").optional(),
  includeInactive: z.enum(["true", "false"]).optional(),
});

// --- 계획 항목 ----------------------------------------------------------------

const planFields = {
  title: z.string().trim().min(1, "제목을 입력해주세요").max(200, "제목은 200자 이내로 입력해주세요"),
  amount: amountField,
  plannedDate: isoDateField,
  datePrecision: z.enum(DATE_PRECISIONS, { message: "날짜 단위는 DAY 또는 MONTH입니다" }),
  brandId: uuidField("분류").nullable().optional(),
  vendorName: optionalText(200, "거래처"),
  description: optionalText(4000, "설명"),
};

export const createPlanSchema = z.object({
  companyId: uuidField("회사"),
  projectId: uuidField("프로젝트"),
  ...planFields,
  datePrecision: planFields.datePrecision.default("DAY"),
  brandId: uuidField("분류").nullable().optional().transform((v) => v ?? null),
  vendorName: nullableText(200, "거래처"),
  description: nullableText(4000, "설명"),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

const versionField = z.number().int().min(1, "버전이 올바르지 않습니다");

/**
 * 수정: version(낙관적 잠금) 필수. 바꿀 칸만 보낸다. company_id·created_by_id 는 받지 않는다.
 * projectId 를 바꾸면 같은 법인 안에서만(복합 FK 가 강제) — 서버가 대상 사업 접근권도 검사한다.
 */
export const updatePlanSchema = z
  .object({
    version: versionField,
    projectId: uuidField("프로젝트").optional(),
    title: planFields.title.optional(),
    amount: planFields.amount.optional(),
    plannedDate: planFields.plannedDate.optional(),
    datePrecision: planFields.datePrecision.optional(),
    brandId: planFields.brandId,
    vendorName: planFields.vendorName,
    description: planFields.description,
  })
  .refine(
    (d) =>
      d.projectId !== undefined ||
      d.title !== undefined ||
      d.amount !== undefined ||
      d.plannedDate !== undefined ||
      d.datePrecision !== undefined ||
      d.brandId !== undefined ||
      d.vendorName !== undefined ||
      d.description !== undefined,
    { message: "변경할 내용이 없습니다" },
  );
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const cancelPlanSchema = z.object({
  version: versionField,
  reason: nullableText(1000, "사유"),
});
export type CancelPlanInput = z.infer<typeof cancelPlanSchema>;

/** 보드·목록 조회. from 이 없으면 서버가 KST 현재 달을 쓴다. brandId="none" 은 공통·미지정만. */
export const boardQuerySchema = z.object({
  from: monthField.optional(),
  months: z.coerce.number().int().min(1).max(12).optional().default(4),
  companyId: uuidField("회사").optional(),
  projectId: uuidField("프로젝트").optional(),
  brandId: z.union([uuidField("분류"), z.literal("none")]).optional(),
  /** PLANNED(기본) = 취소·마감 제외, ALL = 전부 */
  status: z.enum(["PLANNED", "ALL"]).optional().default("PLANNED"),
});
export type BoardQueryInput = z.infer<typeof boardQuerySchema>;

// --- 메모 ----------------------------------------------------------------------

export const commentBodySchema = z.object({
  body: z.string().trim().min(1, "메모를 입력해주세요").max(4000, "메모는 4000자 이내로 입력해주세요"),
});
export type CommentBodyInput = z.infer<typeof commentBodySchema>;

// --- 연결 ----------------------------------------------------------------------

export const linkExpenseSchema = z.object({
  expenseId: uuidField("입금요청"),
});
export type LinkExpenseInput = z.infer<typeof linkExpenseSchema>;

/** 해제는 연결 행 id 로. DELETE 본문 대신 쿼리스트링을 쓴다(프록시·캐시가 본문 있는 DELETE 를 흘린다). */
export const unlinkQuerySchema = z.object({
  linkId: uuidField("연결"),
});
export type UnlinkQueryInput = z.infer<typeof unlinkQuerySchema>;

export const linkCandidatesQuerySchema = z.object({
  q: z.string().trim().max(100, "검색어는 100자 이내로 입력해주세요").optional(),
});

/** 요청 문자열을 쿼리 스키마로. searchParams 를 그대로 넘긴다. */
export function searchParamsToObject(params: URLSearchParams): Record<string, string> {
  const raw: Record<string, string> = {};
  params.forEach((value, key) => {
    if (value !== "") raw[key] = value;
  });
  return raw;
}

/** 한글이 없는 문장 = zod 기본(영문) 문구. 타입 불일치처럼 우리가 문구를 달지 않은 자리다. */
const HANGUL_RE = /[가-힣]/;

/** 칸 이름 → 화면 말. 영문 기본 문구를 바꿀 때 "amount" 대신 "금액" 이라고 적기 위해. */
const FIELD_LABELS: Record<string, string> = {
  companyId: "법인",
  projectId: "프로젝트",
  brandId: "분류",
  title: "제목",
  amount: "금액",
  plannedDate: "예정일",
  datePrecision: "날짜 단위",
  vendorName: "거래처",
  description: "설명",
  version: "버전",
  body: "메모",
  name: "이름",
  memberIds: "참여자",
  userId: "사용자",
  expenseId: "입금요청",
  linkId: "연결",
  reason: "사유",
  categoryCode: "카테고리 코드",
  from: "시작 달",
  months: "개월 수",
  status: "상태",
  q: "검색어",
};

/**
 * zod 오류를 기존 API 형식(", " 로 이은 메시지)으로. 영문 기본 문구("Invalid input: expected number,
 * received string")는 한국어로 바꾼다(QA D-13) — 칸 이름을 화면 말로 적고 조사를 맞춘다.
 */
export function issuesMessage(error: z.ZodError): string {
  return error.issues
    .map((i) => {
      if (HANGUL_RE.test(i.message)) return i.message;
      const key = i.path.length > 0 ? String(i.path[0]) : "";
      const label = FIELD_LABELS[key] ?? key;
      return label ? `${withJosa(label, "이/가")} 올바르지 않습니다` : "입력값이 올바르지 않습니다";
    })
    .join(", ");
}
