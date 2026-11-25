import { NextRequest } from "next/server";
import { validateOrigin } from "@/lib/api-utils";
import { handlePlanError, parseOrThrow, planJson, readJson, requirePlanActor } from "@/lib/plans/api";
import { movePlansSchema } from "@/lib/validations/plan";
import { movePlans } from "@/services/plan.service";

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePlanActor();
    const originError = validateOrigin(request);
    if (originError) return originError;
    const input = parseOrThrow(movePlansSchema, await readJson(request));
    return planJson(await movePlans(actor, input));
  } catch (err) {
    return handlePlanError(err);
  }
}
