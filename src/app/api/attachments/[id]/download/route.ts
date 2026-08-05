import { NextRequest, NextResponse } from "next/server";
import { requireAuth, errorResponse, handleError, validateUUID } from "@/lib/api-utils";
import { db } from "@/lib/db";
import { attachments, expenses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

const STORAGE_BUCKET = "attachments";

/**
 * 서명 URL의 `download` 파라미터에 넣을 파일명.
 *
 * storage-js가 값을 URL 인코딩해 붙이고 Supabase가 한 번 디코딩하므로
 * **직접 인코딩하면 안 된다** (이중 인코딩되어 `%E1%84%8F...`가 그대로 저장된다).
 * 한글은 raw로 넘기면 `filename*=UTF-8''`로 정확히 내려온다.
 *
 * 다만 쿼리스트링을 깨는 ASCII 문자는 인코딩을 거치지 않고 통과해버린다.
 * 쿠팡 영수증(`...orderId=151&vendorIds=...`)처럼 `&`가 들어 있으면 거기서
 * 잘려 `...orderId=151`로 저장된다. 이 문자들만 밑줄로 바꾼다 — 미리
 * 퍼센트 인코딩하는 방식은 위의 이중 인코딩 문제 때문에 쓸 수 없다.
 */
function toDownloadName(fileName: string): string {
  return fileName.replace(/[&#%+?]/g, "_");
}

// ---------------------------------------------------------------------------
// GET /api/attachments/[id]/download -- download an attachment via signed URL
//
// 기본은 '저장' 동작: 서명 URL에 download 파라미터를 붙여 Supabase가
// `Content-Disposition: attachment`를 내려주게 한다. 이유가 두 가지다.
//
//  1) 예전엔 이 헤더가 없어서 브라우저가 렌더 가능한 파일(PDF/이미지)은 탭에
//     띄우고, 렌더 못 하는 파일(HEIC 등)은 새 탭을 열자마자 닫으며 다운로드만
//     했다. 사용자에겐 "탭이 켜지지도 않고 바로 꺼지는" 것으로 보인다.
//  2) 스토리지 키는 업로드 때 한글이 밑줄로 치환된다
//     (예: `..._260804_glph____________________.pdf`). 헤더가 없으면 브라우저가
//     URL 경로에서 파일명을 뽑아 이 깨진 이름으로 저장한다. download 파라미터에
//     DB의 원본 파일명을 넘기면 Supabase가 RFC 5987로 인코딩해 돌려준다.
//
// ?inline=1 이면 예전처럼 브라우저에서 바로 열리게 둔다(미리보기용).
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAuth();
    const id = validateUUID((await context.params).id);
    const inline = request.nextUrl.searchParams.get("inline") === "1";

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
      .createSignedUrl(
        attachment.fileKey,
        60,
        inline ? undefined : { download: toDownloadName(attachment.fileName) },
      );

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
