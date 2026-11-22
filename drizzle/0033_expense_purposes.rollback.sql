BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DROP TABLE IF EXISTS expenseone.expense_purposes;
COMMIT;
