/**
 * DELETE /api/codef/connections/[id]
 *
 * Codef 연결 해제 (soft delete: isActive=false).
 * 기존 staging row 는 유지 (이미 등록된 거래 이력 보존).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  handleError,
  validateOrigin,
} from "@/lib/api-utils";
import { deactivateConnection } from "@/services/codef.service";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const csrfError = validateOrigin(request);
    if (csrfError) return csrfError;

    const user = await requireAuth();
    const { id } = await params;
    await deactivateConnection(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
