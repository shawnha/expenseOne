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
const connectionString = process.env.SUPABASE_DB_URL!;

const client = postgres(connectionString, {
  prepare: false,
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
