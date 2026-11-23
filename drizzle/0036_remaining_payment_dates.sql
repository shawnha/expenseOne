BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE expenseone.expense_remaining_payment_dates (
  expense_id uuid PRIMARY KEY,
  requested_at timestamptz,
  approved_at timestamptz,
  CHECK (requested_at IS NOT NULL OR approved_at IS NOT NULL)
);
ALTER TABLE expenseone.expense_remaining_payment_dates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON expenseone.expense_remaining_payment_dates FROM PUBLIC, anon, authenticated;

COMMIT;
