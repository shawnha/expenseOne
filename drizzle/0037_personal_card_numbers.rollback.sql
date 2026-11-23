BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DROP TABLE IF EXISTS expenseone.common_card_usage, expenseone.personal_card_numbers;
COMMIT;
