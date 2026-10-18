import { NextRequest, NextResponse } from "next/server";
import { errorResponse, handleError, requireAuth, validateOrigin, validateUUID } from "@/lib/api-utils";
import { addRecurringAttachment, listRecurringAttachments } from "@/services/recurring-expense.service";

// GET — 반복 첨부 목록(자동 제출 때 입금요청에 복사해 붙는 파일)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    validateUUID(id);
    const data = await listRecurringAttachments(id, { id: user.id, role: user.role });
    return NextResponse.json({ data });
  } catch (err) {
    return handleError(err);
  }
}

// POST — 반복 첨부 올리기 (multipart: file, documentType)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;
    const user = await requireAuth();
    const { id } = await params;
    validateUUID(id);

    const formData = await request.formData();
    const file = formData.get("file");
    const documentType = String(formData.get("documentType") ?? "").trim();
    if (!(file instanceof File)) return errorResponse("VALIDATION_ERROR", "파일을 선택해주세요.");
    if (!documentType || documentType.length > 100) return errorResponse("VALIDATION_ERROR", "문서 유형을 선택해주세요.");

    const data = await addRecurringAttachment(id, file, documentType, { id: user.id, role: user.role });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
