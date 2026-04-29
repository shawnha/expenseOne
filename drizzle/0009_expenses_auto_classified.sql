-- ---------------------------------------------------------------------------
-- 0009_expenses_auto_classified
-- Adds auto-classification metadata so we can mark expenses created by
-- the FinanceOne classifier (meal/snack auto-detection) and surface them
-- separately in the admin UI.
--
-- - auto_classified           : true when row was created by classifier
-- - auto_classified_source    : 'mapping_rules' | 'history_majority'
-- - auto_classified_account_id: financeone.internal_accounts.id (no FK,
--   cross-schema reference is intentional — lookup only)
-- ---------------------------------------------------------------------------

BEGIN;

SET LOCAL statement_timeout = '60s';

ALTER TABLE expenseone.expenses
  ADD COLUMN IF NOT EXISTS auto_classified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_classified_source varchar(32),
  ADD COLUMN IF NOT EXISTS auto_classified_account_id integer;

CREATE INDEX IF NOT EXISTS idx_expenses_auto_classified
  ON expenseone.expenses (auto_classified)
  WHERE auto_classified = true;

COMMIT;
