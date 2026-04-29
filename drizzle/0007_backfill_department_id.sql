-- ---------------------------------------------------------------------------
-- 0007_backfill_department_id
-- Backfills users.department_id from (users.department, users.company_id).
-- Three passes:
--   1) Direct match against departments table (same name + same company)
--   2) For users with a non-empty department string but no matching row,
--      insert a department row scoped to the user's company and link it.
--   3) Users with NULL/empty department or NULL company_id are left alone
--      (department_id stays NULL).
-- Idempotent — safe to re-run.
--
-- Run inside a transaction with a longer statement_timeout because the
-- Supabase pooler defaults to 15s and the multi-step UPDATE+INSERT can
-- exceed that on a populated table.
-- ---------------------------------------------------------------------------

BEGIN;

SET LOCAL statement_timeout = '120s';

-- 1) Match existing departments
UPDATE expenseone.users u
SET department_id = d.id
FROM expenseone.departments d
WHERE u.department_id IS NULL
  AND u.department IS NOT NULL
  AND u.department <> ''
  AND u.company_id IS NOT NULL
  AND d.company_id = u.company_id
  AND d.name = u.department;

-- 2) For users still unmatched, create a department row per
--    (company_id, department_name) pair, then link.
WITH missing AS (
  SELECT DISTINCT u.company_id, u.department AS name
  FROM expenseone.users u
  WHERE u.department_id IS NULL
    AND u.department IS NOT NULL
    AND u.department <> ''
    AND u.company_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM expenseone.departments d
      WHERE d.company_id = u.company_id AND d.name = u.department
    )
)
INSERT INTO expenseone.departments (id, name, company_id, sort_order, created_at)
SELECT gen_random_uuid(), name, company_id, 999, now()
FROM missing;

-- 3) Final pass — link the rows just inserted
UPDATE expenseone.users u
SET department_id = d.id
FROM expenseone.departments d
WHERE u.department_id IS NULL
  AND u.department IS NOT NULL
  AND u.department <> ''
  AND u.company_id IS NOT NULL
  AND d.company_id = u.company_id
  AND d.name = u.department;

COMMIT;
