import { NextResponse } from "next/server";
import type { z } from "zod";
import { requireAuth } from "@/lib/api-utils";
import { AppError } from "@/services/attachment.service";
import { isCostPlanningAllowed } from "./flag";
import { mapDbError, PlanError, PLAN_ERROR_STATUS, summarizeError, type PlanErrorCode } from "./errors";
import { withJosa } from "./josa";
import { issuesMessage } from "@/lib/validations/plan";

// ---------------------------------------------------------------------------
// 비용계획 라우트 공용 껍데기 (src/app/api/plans/**)
//
// 순서는 항상 같다: requireAuth → 스위치 게이트(OFF 면 404) → 서비스에서 권한 검사.
// OFF 일 때 403 이 아니라 **404** 를 주는 이유: 기능이 있다는 사실 자체를 알리지 않는다(P1).
// 응답 형식은 기존 앱과 같은 `{ error: { code, message } }` 다.
// ---------------------------------------------------------------------------

export interface PlanActor {
  id: string;
  name: string;
  role: "MEMBER" | "ADMIN";
}

/** 로그인 + 스위치. 스위치가 꺼져 있거나 읽기에 실패하면 NOT_FOUND 를 던진다. */
export async function requirePlanActor(): Promise<PlanActor> {
  const user = await requireAuth();
  if (!(await isCostPlanningAllowed(user.id))) {
    throw new PlanError("NOT_FOUND", "페이지를 찾을 수 없습니다.");
  }
  return { id: user.id, name: user.name, role: user.role };
}

export function planError(code: PlanErrorCode, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status: PLAN_ERROR_STATUS[code] });
}

/** PlanError·AppError·postgres 오류를 한 자리에서 응답으로. 알 수 없는 오류만 로그에 남긴다. */
export function handlePlanError(err: unknown): NextResponse {
  const mapped = mapDbError(err);
  if (mapped instanceof PlanError) return planError(mapped.code, mapped.message);
  if (mapped instanceof AppError) return planError(mapped.code, mapped.message);
  // 객체를 통째로 찍지 않는다 — 드리즐 오류 문장에는 실패한 SQL 과 사용자 입력(params)이 들어 있다(QA D-01).
  const s = summarizeError(mapped);
  console.error(`[Plans] unhandled error: ${s.name}${s.code ? ` ${s.code}` : ""}: ${s.message}`);
  return planError("INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.");
}

/** zod 검증. 실패하면 VALIDATION_ERROR 를 던진다(라우트의 catch 가 400 으로 바꾼다). */
export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new PlanError("VALIDATION_ERROR", issuesMessage(parsed.error));
  }
  return parsed.data;
}

/** 본문이 비었거나 JSON 이 아니면 빈 객체로. 스키마가 필수 칸을 대신 걸러 준다. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 경로 파라미터 검사. 형식이 아니면 **404** — 없는 id 와 구분해 주지 않는다. */
export function requireUuidParam(value: string, label: string): string {
  if (!UUID_RE.test(value)) throw new PlanError("NOT_FOUND", `${withJosa(label, "을/를")} 찾을 수 없습니다.`);
  return value;
}

/** GET 응답. 계획 데이터는 사용자별이라 캐시하지 않는다. */
export function planJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ data }, { status, headers: { "Cache-Control": "no-store" } });
}
