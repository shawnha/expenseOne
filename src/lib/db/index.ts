import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Supabase PostgreSQL connection via the `postgres` driver.
 *
 * Vercel serverless invocations are single-tenant, so `max: 1` is the right
 * pool size: each lambda gets its own client and won't hold extra Supabase
 * pooler slots. The previous `max: 10` could exhaust the Transaction-mode
 * pooler (default ~15 active txns) under fan-out from cron, push, and report
 * traffic.
 *
 * - Transaction-mode pooler (port 6543) is required for serverless.
 * - `prepare: false` is required for PgBouncer transaction mode.
 * - `idle_timeout` closes idle connections so stale handles don't pile up.
 * - `connect_timeout` fails fast when the pooler is unreachable.
 */
const connectionString = (process.env.SUPABASE_DB_URL ?? "").trim();

if (!connectionString) {
  console.error("[DB] SUPABASE_DB_URL is not set or empty");
}

const client = postgres(connectionString, {
  prepare: false,
  max: 1,
  idle_timeout: 10,
  max_lifetime: 30,
  connect_timeout: 10,
  ssl: "prefer",
  connection: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    statement_timeout: "15000" as any,
  },
  onnotice: () => {},
});

export const db = drizzle(client, { schema });
