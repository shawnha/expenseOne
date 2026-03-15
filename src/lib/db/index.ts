import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Supabase PostgreSQL connection via the `postgres` driver.
 *
 * - Transaction-mode pooler (port 6543) is recommended for serverless
 *   environments such as Vercel Edge/Serverless Functions.
 * - `prepare: false` is required when using Supabase's transaction-mode
 *   connection pooler (PgBouncer) because prepared statements are not
 *   supported in transaction mode.
 * - `max: 1` keeps the connection pool small, which is appropriate for
 *   serverless where each invocation gets its own instance.
 */
const connectionString = process.env.SUPABASE_DB_URL!;

const client = postgres(connectionString, {
  prepare: false,
  max: 1,
});

export const db = drizzle(client, { schema });
