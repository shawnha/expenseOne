BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DROP TABLE IF EXISTS expenseone.expense_team_shares, expenseone.expense_team_members;
COMMIT;
