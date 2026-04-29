-- ---------------------------------------------------------------------------
-- 0006_users_department_id
-- Adds expenseone.users.department_id (uuid, FK -> departments.id, nullable).
-- This is the first migration of the department denormalization fix
-- (Codex P3-#11). After this:
--   - 0007 backfills department_id from the (department, company_id)
--     string pair, creating department rows when needed.
--   - app code switches reports / profile to read/write department_id.
--   - 0008 drops the legacy users.department string column.
-- Keeping the string column for now means a partially-rolled-out app
-- still works.
--
-- Run inside a transaction with a longer statement_timeout because the
-- Supabase transaction-mode pooler (port 6543) imposes a default 15s
-- statement timeout that's too tight for ALTER TABLE on a populated
-- users table.
-- ---------------------------------------------------------------------------

BEGIN;

SET LOCAL statement_timeout = '60s';

ALTER TABLE expenseone.users
  ADD COLUMN IF NOT EXISTS department_id uuid;

ALTER TABLE expenseone.users
  ADD CONSTRAINT users_department_id_fkey
  FOREIGN KEY (department_id)
  REFERENCES expenseone.departments(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_department_id
  ON expenseone.users (department_id);

COMMIT;
