import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Supabase PostgreSQL connection via the `postgres` driver.
 *
 * - Transaction-mode pooler (port 6543) for serverless (Vercel).
 * - `prepare: false` required for PgBouncer transaction mode.
 * - `max: 1` keeps pool small for serverless invocations.
 * - `idle_timeout: 20` closes idle connections to avoid stale handles.
 * - `connect_timeout: 10` fails fast on connection issues.
 */
const connectionString = (process.env.SUPABASE_DB_URL ?? "").trim();

if (!connectionString) {
  console.error("[DB] SUPABASE_DB_URL is not set or empty");
}

const client = postgres(connectionString, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: "prefer",
  connection: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    statement_timeout: "15000" as any,  // 15s max per query — prevents 300s hang
  },
  onnotice: () => {},
});

export const db = drizzle(client, { schema });
