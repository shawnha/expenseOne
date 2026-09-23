import type { ZodType } from "zod";
import { AppError } from "@/services/attachment.service";
import type { AuthUser } from "@/lib/api-utils";
import type { Actor } from "@/services/tax-invoice.service";

// 세금계산서 라우트 공용: 본문 검증 + AuthUser → Actor.

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "요청 본문을 읽을 수 없습니다.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "));
  }
  return parsed.data;
}

export function toActor(user: AuthUser): Actor {
  return { id: user.id, name: user.name, role: user.role };
}
