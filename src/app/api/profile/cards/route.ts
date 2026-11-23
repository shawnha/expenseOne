import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, handleError, requireAuth, validateOrigin } from "@/lib/api-utils";
import { getPersonalCards, savePersonalCard } from "@/services/personal-card.service";

const fields = z.object({ companyId: z.uuid(), lastFour: z.string().regex(/^[0-9]{4}$/) });
const update = fields.extend({ id: z.uuid() }).strict();

export async function GET() {
  try {
    const user = await requireAuth();
    return NextResponse.json({ data: await getPersonalCards(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleError(error);
  }
}

async function save(request: NextRequest, isUpdate: boolean) {
  try {
    const originError = validateOrigin(request);
    if (originError) return originError;

    const user = await requireAuth();
    const body: unknown = await request.json().catch(() => null);
    const input = (isUpdate ? update : fields.strict()).safeParse(body);
    if (!input.success) return errorResponse("VALIDATION_ERROR", "법인과 카드 뒷자리 4개를 확인해 주세요.");

    const { companyId, lastFour } = input.data;
    const id = "id" in input.data && typeof input.data.id === "string" ? input.data.id : undefined;
    const data = await savePersonalCard(user.id, { companyId, lastFour }, id);
    return NextResponse.json({ data }, { status: isUpdate ? 200 : 201 });
  } catch (error) {
    return handleError(error);
  }
}

export function POST(request: NextRequest) {
  return save(request, false);
}

export function PATCH(request: NextRequest) {
  return save(request, true);
}
