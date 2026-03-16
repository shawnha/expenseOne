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
