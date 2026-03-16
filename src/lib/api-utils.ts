import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AppError } from "@/services/attachment.service";

// ---------------------------------------------------------------------------
// Error response helper
// ---------------------------------------------------------------------------

type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

const STATUS_MAP: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
};

export function errorResponse(code: ErrorCode, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status: STATUS_MAP[code] },
  );
}

export function handleError(err: unknown) {
  if (err instanceof AppError) {
    return errorResponse(err.code, err.message);
  }
  console.error("Unhandled error:", err);
  return errorResponse("INTERNAL_ERROR", "서버 내부 오류가 발생했습니다.");
}

// ---------------------------------------------------------------------------
// Auth: get current user from Supabase session + DB
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "MEMBER" | "ADMIN";
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  // DEV ONLY: bypass auth for API routes (never in production)
  if (process.env.BYPASS_AUTH === "true" && process.env.NODE_ENV === "development") {
    const devId = "00000000-0000-0000-0000-000000000001";
    const devEmail = "dev@company.com";
    const devName = "개발자";
    // Ensure dev user exists in DB (upsert)
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, devId));
    if (!existing) {
      await db.insert(users).values({
        id: devId,
        email: devEmail,
        name: devName,
        role: "ADMIN",
        isActive: true,
      }).onConflictDoNothing();
    }
    return {
      id: devId,
      email: devEmail,
      name: devName,
      role: "ADMIN",
    };
  }

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) return null;

  const [dbUser] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.id, authUser.id));

  if (!dbUser || !dbUser.isActive) return null;

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
  };
}

// ---------------------------------------------------------------------------
// requireAuth -- throws if not authenticated
// ---------------------------------------------------------------------------
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError("UNAUTHORIZED", "로그인이 필요합니다.");
  }
  return user;
}

// ---------------------------------------------------------------------------
// requireAdmin -- throws if not ADMIN
// ---------------------------------------------------------------------------
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();
  if (user.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "관리자 권한이 필요합니다.");
  }
  return user;
}
