import { NextResponse } from "next/server";

/**
 * Verify a Vercel Cron request.
 *
 * Returns null when the request is authorized; otherwise a 401/500 response
 * that the route handler should return immediately.
 *
 * Vercel Cron automatically attaches `Authorization: Bearer ${CRON_SECRET}`
 * to scheduled invocations. If `CRON_SECRET` is not set in the environment,
 * we fail-secure (deny) instead of leaving the endpoint open — the previous
 * behaviour silently allowed any caller when the env var was missing.
 */
export function verifyCronAuth(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[Cron] CRON_SECRET is not configured — denying request");
    return NextResponse.json(
      { error: "cron not configured" },
      { status: 500 },
    );
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
