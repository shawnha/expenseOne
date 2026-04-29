# Drizzle migrations

Hand-managed migrations for `expenseone` schema in Supabase Postgres.

## How to apply

The Supabase transaction-mode pooler (port 6543) imposes a 15s default
`statement_timeout` per statement, which is too tight for some `ALTER TABLE`
operations on populated tables. Always wrap in an explicit transaction with
`SET LOCAL statement_timeout` when adding columns or constraints:

```sql
BEGIN;
SET LOCAL statement_timeout = '60s';
-- migration body
COMMIT;
```

The migrations in this directory already do that where needed.

To run a migration manually:

```bash
psql "$SUPABASE_DB_URL" -f drizzle/000X_<name>.sql
```

## Why not `drizzle-kit push` / `drizzle-kit migrate`?

Production was bootstrapped manually before journal hygiene caught up, so
`drizzle-kit generate` produces conflicting plans (e.g. it sees the same
enum belonging to two schemas at once because of the migration sequence).
Until that's untangled, all migrations here are written by hand and
applied manually. The `meta/_journal.json` is kept in sync as a record
of what's actually been applied.

## Migration history

| File | Applied to prod | Notes |
|------|-----------------|-------|
| `0000_init.sql` | yes | Initial schema. |
| `0001_category_to_varchar.sql` | yes | Category column type fix. |
| `0002_enable_rls.sql` | **deleted from repo** | Targeted `public.*` schema by mistake; was never applied. The RLS policies that ended up in production were created via different paths and live on `expenseone.*`. `0005` closed the remaining gaps. |
| `0003_gowid_source_column.sql` | yes (2026-04-29) | Adds `source` column + composite unique to `gowid_transactions` so GoWid and Codef integer ID namespaces don't collide. |
| `0004_due_date_dedup_unique.sql` | yes (2026-04-29) | Partial unique index on `notifications` for race-free DUE_DATE_REMINDER dedup. |
| `0005_rls_missing_tables.sql` | yes (2026-04-29) | Closes RLS gap on `companies`, `gowid_card_mappings`, `gowid_transactions`. |
| `0006_users_department_id.sql` | yes (2026-04-29) | Adds `users.department_id uuid` FK + index. Phase 1 of department denormalization. |
| `0007_backfill_department_id.sql` | yes (2026-04-29) | Backfills `users.department_id` from the legacy string column. Idempotent. Phase 2. |

## Auxiliary SQL (not numbered migrations)

- `backfill-company-id.sql` — historical backfill script kept for reference.
- `seed-companies.sql` — initial company seed data.
