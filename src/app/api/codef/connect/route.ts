/**
 * POST /api/codef/connect
 *
 * 사용자가 카드사 자격증명을 입력해 Codef 계정 등록 + 즉시 최초 동기화.
 * 비밀번호는 절대 DB 에 저장되지 않음. Codef SDK 가 RSA 암호화 후 Codef 서버로 전송.
 * connectedId 만 AES-256-GCM 암호화 상태로 우리 DB 에 저장.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  errorResponse,
  handleError,
  validateOrigin,
} from "@/lib/api-utils";
import { createConnection, syncConnection } from "@/services/codef.service";
import { CARD_COMPANY_CODES } from "@/lib/codef/client";

const connectSchema = z.object({
  cardCompany: z.enum(
    Object.keys(CARD_COMPANY_CODES) as [keyof typeof CARD_COMPANY_CODES, ...Array<keyof typeof CARD_COMPANY_CODES>],
  ),
  loginId: z.string().min(1, "아이디를 입력해주세요").max(100),
  loginPassword: z.string().min(1, "비밀번호를 입력해주세요").max(200),
  consent: z.boolean().refine((v) => v === true, {
    message: "제3자 정보 제공 동의가 필요합니다",
  }),
});

export async function POST(request: NextRequest) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireAuth();
    const body = await request.json();
    const parsed = connectSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        "VALIDATION_ERROR",
        parsed.error.issues.map((i) => i.message).join(", "),
      );
    }

    const connection = await createConnection({
      userId: user.id,
      cardCompany: parsed.data.cardCompany,
      loginId: parsed.data.loginId,
      loginPassword: parsed.data.loginPassword,
    });

    // 첫 동기화 즉시 실행 (best-effort — 실패해도 연결 성공은 유지)
    let firstSyncError: string | null = null;
    try {
      await syncConnection(connection);
    } catch (err) {
      firstSyncError = err instanceof Error ? err.message : String(err);
      console.error("[Codef connect] 최초 동기화 실패:", err);
    }

    return NextResponse.json(
      {
        data: {
          id: connection.id,
          cardCompany: connection.cardCompany,
          createdAt: connection.createdAt,
          firstSyncError,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}
