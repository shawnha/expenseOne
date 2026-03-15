import { NextRequest, NextResponse } from "next/server";
import { requireAuth, errorResponse, handleError } from "@/lib/api-utils";
import { attachmentUploadSchema } from "@/lib/validations/expense";
import { uploadAttachment } from "@/services/attachment.service";

// ---------------------------------------------------------------------------
// POST /api/attachments/upload -- upload a file (multipart/form-data)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const expenseId = formData.get("expenseId") as string | null;
    const documentType = formData.get("documentType") as string | null;

    if (!file) {
      return errorResponse("VALIDATION_ERROR", "파일을 선택해주세요.");
    }

    const parsed = attachmentUploadSchema.safeParse({
      expenseId,
      documentType,
    });

    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const attachment = await uploadAttachment({
      file,
      expenseId: parsed.data.expenseId,
      documentType: parsed.data.documentType,
      uploadedById: user.id,
    });

    return NextResponse.json({ data: attachment }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
