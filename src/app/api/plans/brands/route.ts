import { NextRequest } from "next/server";
import { validateOrigin } from "@/lib/api-utils";
import { handlePlanError, parseOrThrow, planJson, readJson, requirePlanActor } from "@/lib/plans/api";
import { brandsQuerySchema, createBrandSchema, searchParamsToObject } from "@/lib/validations/plan";
import { createBrand, listBrands } from "@/services/plan.service";

// ---------------------------------------------------------------------------
// GET  /api/plans/brands?companyId=&includeInactive=  -- 법인별 브랜드
// POST /api/plans/brands -- 브랜드 등록 (**대표만**, SCHEMA.md 3절). 첫 출시엔 관리 화면 없이
//                            계획 다이얼로그의 인라인 추가만 쓴다.
// ---------------------------------------------------------------------------

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await requirePlanActor();
    const query = parseOrThrow(brandsQuerySchema, searchParamsToObject(request.nextUrl.searchParams));
    return planJson({ brands: await listBrands(actor, query.companyId, query.includeInactive === "true") });
  } catch (err) {
    return handlePlanError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const actor = await requirePlanActor();
    const input = parseOrThrow(createBrandSchema, await readJson(request));
    return planJson({ brand: await createBrand(actor, input) }, 201);
  } catch (err) {
    return handlePlanError(err);
  }
}
