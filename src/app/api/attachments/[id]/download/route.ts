import { NextRequest, NextResponse } from "next/server";
import { requireAuth, errorResponse, handleError, validateUUID } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { attachments, expenses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

const STORAGE_BUCKET = "attachments";

// ---------------------------------------------------------------------------
// GET /api/attachments/[id]/download -- download an attachment via signed URL
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const id = validateUUID((await context.params).id);

    // 1. Find the attachment
    const [attachment] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id));

    if (!attachment) {
      return errorResponse("NOT_FOUND", "첨부파일을 찾을 수 없습니다.");
    }

    // 2. Authorization check
    if (user.role !== "ADMIN") {
      // MEMBER: can only download own uploads or attachments on own expenses
      if (attachment.uploadedById !== user.id) {
        // Check if the attachment belongs to an expense submitted by this user
        const [expense] = await db
          .select({ submittedById: expenses.submittedById })
          .from(expenses)
          .where(eq(expenses.id, attachment.expenseId));

        if (!expense || expense.submittedById !== user.id) {
          return errorResponse(
            "FORBIDDEN",
            "본인이 업로드했거나 본인 비용의 첨부파일만 다운로드할 수 있습니다.",
          );
        }
      }
    }

    // 3. Create signed URL (expires in 60 seconds)
    const supabase = await createClient();
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(attachment.fileKey, 60);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("Signed URL error:", signedUrlError);
      return errorResponse(
        "INTERNAL_ERROR",
        "파일 다운로드 URL 생성에 실패했습니다.",
      );
    }

    // 4. Redirect to signed URL (302)
    return NextResponse.redirect(signedUrlData.signedUrl, 302);
  } catch (err) {
    return handleError(err);
  }
}
