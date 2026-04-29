import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Supabase PostgreSQL connection via the `postgres` driver.
 *
 * Vercel may serve multiple requests on a warm function instance, and pages
 * fan-out queries via Promise.all — `max: 1` serialises everything onto a
 * single connection and surfaces as visible page hangs. `max: 5` keeps each
 * instance responsive while staying well under the Supabase pooler ceiling
 * even at moderate concurrency.
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
  max: 5,
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
