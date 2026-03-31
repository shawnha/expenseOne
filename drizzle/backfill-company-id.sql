-- Backfill company_id for existing data
-- Default all NULL company_id records to 한아원코리아 (slug: korea)

DO $$
DECLARE
  korea_id UUID;
BEGIN
  SELECT id INTO korea_id FROM expenseone.companies WHERE slug = 'korea';

  IF korea_id IS NULL THEN
    RAISE EXCEPTION 'Company with slug "korea" not found. Run seed-companies.sql first.';
  END IF;

  -- Backfill expenses
  UPDATE expenseone.expenses SET company_id = korea_id WHERE company_id IS NULL;

  -- Backfill users
  UPDATE expenseone.users SET company_id = korea_id WHERE company_id IS NULL;

  -- Backfill departments
  UPDATE expenseone.departments SET company_id = korea_id WHERE company_id IS NULL;

  -- Verify no NULLs remain
  RAISE NOTICE 'Remaining NULL expenses: %', (SELECT count(*) FROM expenseone.expenses WHERE company_id IS NULL);
  RAISE NOTICE 'Remaining NULL users: %', (SELECT count(*) FROM expenseone.users WHERE company_id IS NULL);
  RAISE NOTICE 'Remaining NULL departments: %', (SELECT count(*) FROM expenseone.departments WHERE company_id IS NULL);
END $$;
