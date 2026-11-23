BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DROP TABLE IF EXISTS expenseone.expense_remaining_payment_dates;
COMMIT;
