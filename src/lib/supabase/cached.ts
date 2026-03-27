import { cache } from "react";
import { createClient } from "./server";

/**
 * Cached auth user — deduplicated per request.
 * Middleware runs on Edge Runtime (cannot share), but layout + page
 * share the same Node.js request context, so this eliminates
 * duplicate getUser() calls within a single render.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Cached Supabase server client — reuse within a single request.
 */
export const getCachedClient = cache(async () => {
  return createClient();
});

/**
 * Cached current user with DB profile (role, name, email).
 * Replaces getCurrentUser() from api-utils for server components.
 */
export const getCachedCurrentUser = cache(async () => {
  const { db } = await import("@/lib/db");
  const { users } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const authUser = await getAuthUser();
  if (!authUser) return null;

  const [dbUser] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      department: users.department,
      profileImageUrl: users.profileImageUrl,
      onboardingCompleted: users.onboardingCompleted,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, authUser.id));

  if (!dbUser || !dbUser.isActive) return null;

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role as "MEMBER" | "ADMIN",
    department: dbUser.department,
    profileImageUrl: dbUser.profileImageUrl,
    onboardingCompleted: dbUser.onboardingCompleted,
    isActive: dbUser.isActive,
    createdAt: dbUser.createdAt,
    updatedAt: dbUser.updatedAt,
  };
});
